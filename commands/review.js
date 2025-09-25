const {
    getPost,
    postMessage,
    postMessageInTreed,
    getChannelMembers,
    getUserByUsername,
    getUserByEmail,
} = require('../mattermost/utils');

const {
    getReviewTaskByKey,
    getReviewTaskByPostId,
    addReviewTask,
    updateReviewTaskStatus,
    updateReviewTaskReviewer,
    addTaskNotification,
} = require('../db/models/reviewTask');

const JiraService = require('../services/jiraService');
const GitlabService = require('../services/gitlabService');
const JiraStatusType = require('../types/jiraStatusTypes');
const { isToDoStatus, isInProgressStatus } = require('../services/jiraService/jiraHelper');
const { INREVIEW_CHANNEL_IDS } = require('../config');
const logger = require('../logger');

const GENERIC_REVIEWER_EMAIL = 'caseone@pravo.tech';
const REVIEWER_NAME_TO_MENTION = {
    'caseone-back': '@c1-back',
    'caseone-tester': '@c1-qa',
    'caseone-frontend': '@c1-front',
    'caseone-analyst': '@c1-analyst',
};

/** Утилиты/гварды */
const hasValue = (v) => v != null && v !== '';

/** Проверка, состоит ли пользователь в канале */
async function isUserInChannel(channelId, userId) {
    const members = await getChannelMembers(channelId);
    return members.some((m) => m.user_id === userId);
}

/** Найти запись reviewTask по треду */
async function findReviewTaskByThread(post_id) {
    const post = await getPost(post_id);
    return getReviewTaskByPostId(post.root_id);
}

/** Безопасно получить пользователя Mattermost по email */
async function getMattermostUser(email) {
    try {
        return await getUserByEmail(email);
    } catch {
        return null;
    }
}

/** Универсальный резолвер упоминания ревьювера */
async function resolveReviewerMention(email, name) {
    const emailLc = (email || '').trim().toLowerCase();
    const nameLc = (name || '').trim().toLowerCase();

    if (emailLc === GENERIC_REVIEWER_EMAIL) {
        return REVIEWER_NAME_TO_MENTION[nameLc] || null;
    }

    const user = await getMattermostUser(emailLc);
    return user ? `@${user.username}` : null;
}

/** Собрать упоминания из списка ревьюверов задачи */
async function collectReviewerMentions(reviewers) {
    const mentions = new Set();
    for (const r of reviewers) {
        try {
            const mention = await resolveReviewerMention(r?.email, r?.name);
            if (mention) mentions.add(mention);
        } catch (err) {
            logger.warn(`Не удалось получить пользователя по email ${r?.email}: ${err?.message || err}`);
        }
    }
    return Array.from(mentions);
}

/** Вернуть строку-упоминание(я) ревьюверов, если явно не переданы */
async function getReviewer(reviewer, task) {
    if (hasValue(reviewer)) return reviewer;

    if (!Array.isArray(task?.reviewers) || task.reviewers.length === 0) {
        return null;
    }

    const mentions = await collectReviewerMentions(task.reviewers);
    return mentions.length ? mentions.join(', ') : null;
}

/** Возвращает Url PR/merge request, если он есть */
function getMergeRequestUrl(task, mergeRequest) {
    if (mergeRequest) {
        return mergeRequest;
    } else if (task.pullRequests && task.pullRequests.length === 1) {
        return task.pullRequests[0].url;
    }
    return null;
}

/**
 * Парсит GitLab URL и возвращает проект и IID MR
 * @param {string} url - ссылка на Merge Request
 * @returns {{ project: string, mrIid: number } | null}
 */
function parseGitlabMrUrl(url) {
    const regex = /\/([^/]+)\/-\/merge_requests\/(\d+)$/;
    const match = url.match(regex);

    if (!match) {
        return null;
    }

    return {
        project: match[1],
        mrIid: parseInt(match[2], 10),
    };
}

/** Сборка первичного сообщения при переводе в INREVIEW */
async function prepareMessage(task, mergeRequest, user_name, reviewer) {
    let msg = `**${JiraStatusType.INREVIEW.toUpperCase()}** [${task.key}](https://jira.parcsis.org/browse/${task.key}) ${task.summary}`;

    // PR/merge-request ссылка
    if (mergeRequest) {
        msg += `\n[${mergeRequest}](${mergeRequest})`;
    }

    msg += `\nАвтор: ${user_name}`;

    // Явно переданный reviewer — выводим как есть
    if (hasValue(reviewer)) {
        msg += `\nРевьювер: ${reviewer}`;
        return msg;
    }

    // Иначе — собираем из task.reviewers
    if (Array.isArray(task.reviewers) && task.reviewers.length > 0) {
        const mentions = await collectReviewerMentions(task.reviewers);
        if (mentions.length > 1) {
            msg += `\nРевьюверы: ${mentions.join(', ')}`;
        } else if (mentions.length === 1) {
            msg += `\nРевьювер: ${mentions[0]}`;
        }
    }

    return msg;
}

/** Повторное сообщение в тред (когда запись уже существует) */
function buildRepeatedReviewMessage(taskKey, taskStatus, reviewer, reviewTask) {
    const base =
        taskStatus !== JiraStatusType.INREVIEW
            ? `Задача [${taskKey}](https://jira.parcsis.org/browse/${taskKey}) переведена в статус **${JiraStatusType.INREVIEW}**`
            : `Обратите внимание на задачу [${taskKey}](https://jira.parcsis.org/browse/${taskKey})`;

    if (hasValue(reviewer) && reviewer !== reviewTask.reviewer) {
        return `${base}\nИзменён ревьювер: ${reviewer || 'не указан'}`;
    }

    if (hasValue(reviewTask.reviewer)) {
        return `${base}\nРевьювер: ${reviewTask.reviewer}`;
    }

    return base;
}

/**
 * Перевод задачи по цепочке в INREVIEW, не меняя логику:
 * - Если ToDo -> пробуем INPROGRESS, затем INREVIEW
 * - Если InProgress -> пробуем INREVIEW
 * При неудаче пишем в исходный тред и прекращаем выполнение.
 */
async function moveTaskToInReview(taskKey, currentStatus, post_id) {
    let status = currentStatus;

    if (isToDoStatus(status)) {
        const ok = await JiraService.changeTaskStatus(taskKey, JiraStatusType.INPROGRESS);
        if (!ok) {
            await postMessageInTreed(
                post_id,
                `Не удалось перевести задачу [${taskKey}](https://jira.parcsis.org/browse/${taskKey}) в статус **${JiraStatusType.INPROGRESS}**.`
            );
            return { ok: false, status };
        }
        status = JiraStatusType.INPROGRESS;
    }

    if (isInProgressStatus(status)) {
        const ok = await JiraService.changeTaskStatus(taskKey, JiraStatusType.INREVIEW);
        if (!ok) {
            await postMessageInTreed(
                post_id,
                `Не удалось перевести задачу [${taskKey}](https://jira.parcsis.org/browse/${taskKey}) в статус **${JiraStatusType.INREVIEW}**.`
            );
            return { ok: false, status };
        }
        status = JiraStatusType.INREVIEW;
    }

    return { ok: true, status };
}

/** (Опционально) установка ревьюверов в Jira */
async function setReviewers(taskKey, users) {
    const userList = String(users)
        .split(',')
        .map((u) => (u.startsWith('@') ? u.slice(1) : u).trim())
        .filter(Boolean);

    const mmUsers = await Promise.all(userList.map((u) => getUserByUsername(u)));
    const valid = mmUsers.filter((u) => u?.username);

    if (valid.length > 0) {
        await JiraService.setReviewers(taskKey, valid.map((u) => u.username));
    }
}

/** Входная точка команды */
module.exports = async ({ post_id, user_id, user_name, args }) => {
    try {
        const [taskKey, mergeRequest, reviewer] = Array.isArray(args) ? args : [];

        // 1) Найти связанную запись reviewTask (по key или по посту)
        const reviewTask =
            taskKey == null ? await findReviewTaskByThread(post_id) : await getReviewTaskByKey(taskKey);

        if (taskKey == null && reviewTask == null) {
            await postMessageInTreed(
                post_id,
                `Не удалось найти задачу для перевода в статус **${JiraStatusType.INREVIEW}**. Укажите task_key или убедитесь, что задача уже существует.`
            );
            return;
        }

        // 2) Определить ключ задачи и получить актуальные данные из Jira
        const key = taskKey || reviewTask.task_key;
        const task = await JiraService.fetchTask(key);
        const mergeRequestLink = getMergeRequestUrl(task, mergeRequest);
        const message = await prepareMessage(task, mergeRequestLink, user_name, reviewer);
        let taskStatus = task.status;

        // 3) Обработать все целевые каналы
        for (const channelId of INREVIEW_CHANNEL_IDS) {
            const userInChannel = await isUserInChannel(channelId, user_id);
            if (!userInChannel) continue;

            // 3.1) Перевести по цепочке ToDo -> InProgress -> InReview
            const moveResult = await moveTaskToInReview(key, taskStatus, post_id);
            if (!moveResult.ok) return;
            taskStatus = moveResult.status;

            // 3.2) Если таск уже отслеживается — допостим уведомление в старый тред и обновим метаданные
            if (reviewTask) {
                const repeatedMsg = buildRepeatedReviewMessage(key, taskStatus, reviewer, reviewTask);

                await postMessageInTreed(reviewTask.post_id, repeatedMsg);

                await updateReviewTaskStatus({ task_key: key, status: JiraStatusType.INREVIEW });

                if (hasValue(reviewer) && reviewer !== reviewTask.reviewer) {
                    await updateReviewTaskReviewer({ task_key: key, reviewer });
                }

                await addTaskNotification(reviewTask.id);
                continue;
            }

            // 3.3) Иначе — создаём новую запись и постим сообщение в канал
            const post = await postMessage(channelId, message);
            const reviewerResolved = await getReviewer(reviewer, task);

            let gitlabMergeRequestId = null;
            const mergeRequestData = mergeRequestLink ? parseGitlabMrUrl(mergeRequestLink) : null;
            if (mergeRequestData) {
                const project = await GitlabService.getProjectByName(mergeRequestData.project);
                if (project) {
                    gitlabMergeRequestId = await GitlabService.addMergeRequest({
                        project_id: project.project_id,
                        mr_iid: mergeRequestData.mrIid,
                        status: GitlabService.STATUSES.NEW,
                    });
                }
            }

            const reviewTaskId = await addReviewTask({
                channel_id: channelId,
                post_id: post.id,
                user_id,
                task_key: key,
                merge_request_url: mergeRequest || null,
                reviewer: reviewerResolved,
                gitlab_merge_request_id: gitlabMergeRequestId,
            });

            await addTaskNotification(reviewTaskId);

            // Поведение оставлено как было:
            // if (hasValue(reviewer)) {
            //   await setReviewers(key, reviewer);
            // }
        }
    } catch (error) {
        logger.error(error);
    }
};
