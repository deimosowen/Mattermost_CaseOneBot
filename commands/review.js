const {
    getPost,
    postMessage,
    postMessageInTreed,
    getUserByUsername,
} = require('../mattermost/utils');

const {
    getReviewTaskByKey,
    getReviewTaskByPostId,
    updateReviewTaskStatus,
    updateReviewTaskReviewer,
} = require('../db/models/reviewTask');

const JiraService = require('../services/jiraService');
const reviewDistributionService = require('../services/reviewDistributionService');
const reviewTaskService = require('../services/reviewTaskService');
const JiraStatusType = require('../types/jiraStatusTypes');
const { getEnabledReviewChannelIdsForUser } = require('../services/reviewChannelAvailabilityService');
const logger = require('../logger');
const CONFLUENCE_LINK_ONLY_CHANNEL_ID = '5n7ic16hqfn8ibfgek48bohesh';

/**
 * Обработчики сообщений для разных каналов
 * Каждый обработчик - это async функция, которая принимает task и возвращает messageText
 * Если обработчик возвращает null, используется дефолтное поведение
 */
const channelMessageHandlers = {
    /**
     * Дефолтный обработчик - возвращает null для использования стандартной логики
     * @param {Object} task - Задача из Jira
     * @returns {Promise<string|null>} - Текст сообщения или null для дефолта
     */
    default: async (task) => {
        return null;
    },

    [CONFLUENCE_LINK_ONLY_CHANNEL_ID]: async (task) => {
        const confluenceURL = task.confluenceURL;
        if (confluenceURL) {
            return `[${confluenceURL}](${confluenceURL})`;
        }
        return null;
    }
};

/**
 * Получает текст сообщения для канала
 * @param {string} channelId - ID канала
 * @param {Object} task - Задача из Jira
 * @returns {Promise<string|null>} - Текст сообщения или null для дефолта
 */
async function getMessageTextForChannel(channelId, task) {
    // Проверяем, есть ли обработчик для этого канала
    const handler = channelMessageHandlers[channelId] || channelMessageHandlers.default;

    try {
        const messageText = await handler(task);
        return messageText;
    } catch (error) {
        logger.error(`Error in message handler for channel ${channelId}: ${error.message}`);
        // В случае ошибки возвращаем null для использования дефолтного поведения
        return null;
    }
}

/** Утилиты/гварды */
const hasValue = (v) => v != null && v !== '';

/** Найти запись reviewTask по треду */
async function findReviewTaskByThread(post_id) {
    const post = await getPost(post_id);
    return getReviewTaskByPostId(post.root_id);
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
        const mergeRequestLink = reviewTaskService.getMergeRequestUrl(task, mergeRequest);
        let taskStatus = task.status;

        // 3) Получаем доступные пользователю каналы ревью и обрабатываем все целевые каналы
        const reviewChannelIds = await getEnabledReviewChannelIdsForUser(user_id);
        for (const channelId of reviewChannelIds) {
            // 3.1) Перевести по цепочке ToDo -> InProgress -> InReview
            const moveResult = await reviewTaskService.moveTaskToInReview(key, taskStatus, post_id);
            if (!moveResult.ok) return;
            taskStatus = moveResult.status;

            // 3.2) Если таск уже отслеживается — допостим уведомление в старый тред и обновим метаданные
            if (reviewTask) {
                const repeatedMsg = reviewTaskService.buildRepeatedReviewMessage(key, taskStatus, reviewer, reviewTask);

                await postMessageInTreed(reviewTask.post_id, repeatedMsg);

                await updateReviewTaskStatus({ task_key: key, status: JiraStatusType.INREVIEW });

                // Обновляем ревьюера, если указан явно
                let finalReviewer = reviewer;
                if (hasValue(reviewer) && reviewer !== reviewTask.reviewer) {
                    await updateReviewTaskReviewer({ task_key: key, reviewer });
                }
                // Если ревьюер не указан явно и в задаче нет ревьюера, пробуем автоматически назначить
                else if (!hasValue(reviewer) && !hasValue(reviewTask.reviewer)) {
                    finalReviewer = await reviewTaskService.assignReviewerAutomatically(channelId, key);
                    if (finalReviewer) {
                        await updateReviewTaskReviewer({ task_key: key, reviewer: finalReviewer });
                        logger.info(`[Review] Автоматически назначен ревьюер ${finalReviewer} для существующей задачи ${key} в канале ${channelId}`);

                        // Уведомляем в треде о назначении ревьюера
                        await postMessageInTreed(reviewTask.post_id, `Автоматически назначен ревьювер: ${finalReviewer}`);
                    }
                }

                const { addTaskNotification } = require('../db/models/reviewTask');
                await addTaskNotification(reviewTask.id);
                continue;
            }

            // 3.3) Иначе — создаём новую запись и постим сообщение в канал
            let reviewerResolved = await reviewTaskService.getReviewer(reviewer, task);

            // 3.4) Получаем текст сообщения для канала (может быть кастомным или дефолтным)
            const messageText = await getMessageTextForChannel(channelId, task);
            const contentType = messageText ? 'message' : null;

            // 3.5) Формируем сообщение с учетом кастомного текста для канала
            const message = await reviewTaskService.prepareReviewMessage(
                task,
                mergeRequestLink,
                user_name,
                reviewer,
                messageText,
                contentType
            );

            // 3.6) Если ревьюер не указан, пробуем автоматически назначить через систему распределения
            let messageToPost = message;
            if (!hasValue(reviewerResolved)) {
                reviewerResolved = await reviewTaskService.assignReviewerAutomatically(channelId, key);
                if (reviewerResolved) {
                    logger.info(`[Review] Автоматически назначен ревьюер ${reviewerResolved} для задачи ${key} в канале ${channelId}`);
                    // Обновляем сообщение с назначенным ревьюером перед отправкой
                    messageToPost = message + `\nРевьювер: ${reviewerResolved}`;
                }
            }

            const post = await postMessage(channelId, messageToPost);
            if (!post?.id) {
                logger.error(`[Review] Не удалось отправить сообщение в канал ${channelId} для задачи ${key}`);
                continue;
            }

            // Обрабатываем GitLab merge request
            const gitlabMergeRequestId = await reviewTaskService.processGitlabMergeRequest(mergeRequestLink);

            // Создаем или обновляем reviewTask
            await reviewTaskService.createOrUpdateReviewTask({
                taskKey: key,
                channelId,
                postId: post.id,
                userId: user_id,
                mergeRequestUrl: mergeRequest || null,
                reviewer: reviewerResolved,
                gitlabMergeRequestId,
            });

            // Поведение оставлено как было:
            // if (hasValue(reviewer)) {
            //   await setReviewers(key, reviewer);
            // }
        }
    } catch (error) {
        logger.error(error);
    }
};
