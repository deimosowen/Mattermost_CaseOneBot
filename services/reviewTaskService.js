const JiraService = require('./jiraService');
const GitlabService = require('./gitlabService');
const reviewDistributionService = require('./reviewDistributionService');
const { getUserByEmail, getUserByUsername } = require('../mattermost/utils');
const { parseGitlabMrUrl } = require('./gitlabService/gitlabHelper');
const { isToDoStatus, isInProgressStatus } = require('./jiraService/jiraHelper');
const JiraStatusType = require('../types/jiraStatusTypes');
const {
    getReviewTaskByKey,
    addReviewTask,
    updateReviewTaskStatus,
    updateReviewTaskReviewer,
    addTaskNotification,
} = require('../db/models/reviewTask');
const logger = require('../logger');

/** Константы */
const GENERIC_REVIEWER_EMAIL = 'caseone@pravo.tech';
const REVIEWER_NAME_TO_MENTION = {
    'caseone-back': '@c1-back',
    'caseone-tester': '@c1-qa',
    'caseone-frontend': '@c1-front',
    'caseone-analyst': '@c1-analyst',
};

/** Утилиты */
const hasValue = (v) => v != null && v !== '';

/**
 * Резолвинг упоминания ревьювера из email и имени
 * @param {string} email - Email ревьювера
 * @param {string} name - Имя ревьювера
 * @returns {Promise<string|null>} - Упоминание в формате @username или null
 */
async function resolveReviewerMention(email, name) {
    const emailLc = (email || '').trim().toLowerCase();
    const nameLc = (name || '').trim().toLowerCase();

    if (emailLc === GENERIC_REVIEWER_EMAIL) {
        return REVIEWER_NAME_TO_MENTION[nameLc] || null;
    }

    try {
        const user = await getUserByEmail(emailLc);
        return user ? `@${user.username}` : null;
    } catch (err) {
        logger.warn(`Не удалось получить пользователя по email ${email}: ${err?.message || err}`);
        return null;
    }
}

/**
 * Собрать упоминания из списка ревьюверов задачи
 * @param {Array<{email: string, name: string}>} reviewers - Массив ревьюверов
 * @returns {Promise<Array<string>>} - Массив упоминаний
 */
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

/**
 * Получить ревьювера: либо явно переданный, либо из задачи
 * @param {string|null} reviewer - Явно переданный ревьювер
 * @param {Object} task - Задача из Jira
 * @returns {Promise<string|null>} - Упоминание ревьювера или null
 */
async function getReviewer(reviewer, task) {
    if (hasValue(reviewer)) return reviewer;

    if (!Array.isArray(task?.reviewers) || task.reviewers.length === 0) {
        return null;
    }

    const mentions = await collectReviewerMentions(task.reviewers);
    return mentions.length ? mentions.join(', ') : null;
}

/**
 * Получить URL merge request из задачи или явно переданного значения
 * @param {Object} task - Задача из Jira
 * @param {string|null} mergeRequest - Явно переданный merge request
 * @returns {string|null} - URL merge request или null
 */
function getMergeRequestUrl(task, mergeRequest) {
    if (mergeRequest) {
        return mergeRequest;
    } else if (task.pullRequests && task.pullRequests.length === 1) {
        return task.pullRequests[0].url;
    }
    return null;
}

/**
 * Формирование сообщения для ревью
 * @param {Object} task - Задача из Jira
 * @param {string|null} mergeRequest - URL merge request
 * @param {string} userName - Имя пользователя
 * @param {string|null} reviewer - Ревьювер
 * @param {string|null} messageText - Дополнительный текст сообщения (для UI)
 * @param {string|null} contentType - Тип контента: 'pr' или 'message' (для UI)
 * @returns {Promise<string>} - Сформированное сообщение
 */
async function prepareReviewMessage(task, mergeRequest, userName, reviewer, messageText = null, contentType = null) {
    let msg = `**${JiraStatusType.INREVIEW.toUpperCase()}** [${task.key}](https://jira.parcsis.org/browse/${task.key}) ${task.summary}`;

    // Добавляем merge request или текст сообщения
    if (contentType === 'pr') {
        const mergeRequestLink = mergeRequest || getMergeRequestUrl(task, null);
        if (mergeRequestLink) {
            msg += `\n[${mergeRequestLink}](${mergeRequestLink})`;
        }
    } else if (contentType === 'message' && messageText) {
        msg += `\n${messageText}`;
    } else if (mergeRequest) {
        // Для команды (без contentType)
        msg += `\n[${mergeRequest}](${mergeRequest})`;
    }

    msg += `\nАвтор: ${userName}`;

    // Обрабатываем ревьювера
    const reviewerResolved = await getReviewer(reviewer, task);
    if (reviewerResolved) {
        if (reviewerResolved.includes(',')) {
            msg += `\nРевьюверы: ${reviewerResolved}`;
        } else {
            msg += `\nРевьювер: ${reviewerResolved}`;
        }
    }

    return msg;
}

/**
 * Перевод задачи в статус INREVIEW по цепочке: ToDo -> InProgress -> InReview
 * @param {string} taskKey - Ключ задачи
 * @param {string} currentStatus - Текущий статус задачи
 * @param {string|null} postId - ID поста для отправки ошибок (опционально)
 * @returns {Promise<{ok: boolean, status: string}>} - Результат перевода
 */
async function moveTaskToInReview(taskKey, currentStatus, postId = null) {
    let status = currentStatus;

    if (isToDoStatus(status)) {
        const ok = await JiraService.changeTaskStatus(taskKey, JiraStatusType.INPROGRESS);
        if (!ok) {
            if (postId) {
                const { postMessageInTreed } = require('../mattermost/utils');
                await postMessageInTreed(
                    postId,
                    `Не удалось перевести задачу [${taskKey}](https://jira.parcsis.org/browse/${taskKey}) в статус **${JiraStatusType.INPROGRESS}**.`
                );
            }
            return { ok: false, status };
        }
        status = JiraStatusType.INPROGRESS;
    }

    if (isInProgressStatus(status)) {
        const ok = await JiraService.changeTaskStatus(taskKey, JiraStatusType.INREVIEW);
        if (!ok) {
            if (postId) {
                const { postMessageInTreed } = require('../mattermost/utils');
                await postMessageInTreed(
                    postId,
                    `Не удалось перевести задачу [${taskKey}](https://jira.parcsis.org/browse/${taskKey}) в статус **${JiraStatusType.INREVIEW}**.`
                );
            }
            return { ok: false, status };
        }
        status = JiraStatusType.INREVIEW;
    }

    return { ok: true, status };
}

/**
 * Обработка GitLab merge request: парсинг URL и добавление в БД
 * @param {string|null} mergeRequestUrl - URL merge request
 * @returns {Promise<number|null>} - ID merge request в БД или null
 */
async function processGitlabMergeRequest(mergeRequestUrl) {
    if (!mergeRequestUrl) {
        return null;
    }

    try {
        const mergeRequestData = parseGitlabMrUrl(mergeRequestUrl);
        if (!mergeRequestData) {
            return null;
        }

        const project = await GitlabService.getProjectByName(mergeRequestData.project);
        if (!project) {
            return null;
        }

        const gitlabMergeRequestId = await GitlabService.addMergeRequest({
            project_id: project.project_id,
            mr_iid: mergeRequestData.mrIid,
            status: GitlabService.STATUSES.NEW,
        });

        return gitlabMergeRequestId;
    } catch (error) {
        logger.error(`Ошибка при обработке GitLab MR ${mergeRequestUrl}: ${error.message}`);
        return null;
    }
}

/**
 * Создание или обновление reviewTask
 * @param {Object} params - Параметры
 * @param {string} params.taskKey - Ключ задачи
 * @param {string} params.channelId - ID канала
 * @param {string} params.postId - ID поста
 * @param {string} params.userId - ID пользователя
 * @param {string|null} params.mergeRequestUrl - URL merge request
 * @param {string|null} params.reviewer - Ревьювер
 * @param {number|null} params.gitlabMergeRequestId - ID merge request в GitLab
 * @returns {Promise<number>} - ID reviewTask
 */
async function createOrUpdateReviewTask({
    taskKey,
    channelId,
    postId,
    userId,
    mergeRequestUrl,
    reviewer,
    gitlabMergeRequestId,
}) {
    const reviewTask = await getReviewTaskByKey(taskKey);

    if (reviewTask) {
        // Обновляем существующую запись
        await updateReviewTaskStatus({ task_key: taskKey, status: JiraStatusType.INREVIEW });
        if (reviewer) {
            await updateReviewTaskReviewer({ task_key: taskKey, reviewer });
        }
        await addTaskNotification(reviewTask.id);
        return reviewTask.id;
    } else {
        // Создаем новую запись
        const reviewTaskId = await addReviewTask({
            channel_id: channelId,
            post_id: postId,
            user_id: userId,
            task_key: taskKey,
            merge_request_url: mergeRequestUrl || null,
            reviewer: reviewer || null,
            gitlab_merge_request_id: gitlabMergeRequestId || null,
        });
        await addTaskNotification(reviewTaskId);
        return reviewTaskId;
    }
}

/**
 * Автоматическое назначение ревьювера через систему распределения
 * @param {string} channelId - ID канала
 * @param {string} taskKey - Ключ задачи
 * @returns {Promise<string|null>} - Упоминание ревьювера или null
 */
async function assignReviewerAutomatically(channelId, taskKey) {
    try {
        const assignedReviewer = await reviewDistributionService.assignReviewerForTask(channelId, taskKey);
        if (assignedReviewer) {
            return `@${assignedReviewer.user_name}`;
        }
        return null;
    } catch (error) {
        logger.error(`Ошибка при автоматическом назначении ревьювера для ${taskKey}: ${error.message}`);
        return null;
    }
}

/**
 * Формирование сообщения для повторного ревью (когда запись уже существует)
 * @param {string} taskKey - Ключ задачи
 * @param {string} taskStatus - Статус задачи
 * @param {string|null} reviewer - Ревьювер
 * @param {Object} reviewTask - Существующая запись reviewTask
 * @returns {string} - Сформированное сообщение
 */
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

module.exports = {
    resolveReviewerMention,
    collectReviewerMentions,
    getReviewer,
    getMergeRequestUrl,
    prepareReviewMessage,
    moveTaskToInReview,
    processGitlabMergeRequest,
    createOrUpdateReviewTask,
    assignReviewerAutomatically,
    buildRepeatedReviewMessage,
    GENERIC_REVIEWER_EMAIL,
    REVIEWER_NAME_TO_MENTION,
};

