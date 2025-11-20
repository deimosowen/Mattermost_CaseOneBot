const express = require('express');
const reviewDistributionService = require('../../services/reviewDistributionService');
const { getReviewQueue, addReviewerToQueue, removeReviewerFromQueue, updateReviewQueueOrder, clearReviewQueue } = require('../../db/models/reviewQueue');
const { getChannelById, getUserByUsername, getChannelMembers, getUser } = require('../../mattermost/utils');
const logger = require('../../logger');

const router = express.Router();

// Главная страница настроек ревью
router.get('/settings', async (req, res) => {
    const { channel_id } = req.query;

    if (!channel_id) {
        res.render('reviewSettings', {
            error: 'Не указан channel_id',
            settings: null,
            reviewers: [],
            channel: null
        });
        return;
    }

    try {
        const channel = await getChannelById(channel_id);
        const settings = await reviewDistributionService.getChannelSettings(channel_id);
        const reviewers = await getReviewQueue(channel_id);

        // Получаем детали пользователей для ревьюеров
        const reviewersWithDetails = await Promise.all(reviewers.map(async (reviewer) => {
            try {
                const userDetails = await getUser(reviewer.user_id);
                return {
                    ...reviewer,
                    displayName: userDetails ? `${userDetails.first_name || ''} ${userDetails.last_name || ''}`.trim() || userDetails.username : reviewer.user_name,
                    username: userDetails?.username || reviewer.user_name
                };
            } catch (error) {
                logger.warn(`Could not get user details for ${reviewer.user_id}:`, error);
                return {
                    ...reviewer,
                    displayName: reviewer.user_name,
                    username: reviewer.user_name
                };
            }
        }));

        res.render('reviewSettings', {
            error: null,
            settings: settings || { is_enabled: false, review_type: 'manual' },
            reviewers: reviewersWithDetails,
            channel: channel ? {
                id: channel.id,
                name: channel.display_name || channel.name || channel_id
            } : { id: channel_id, name: `Канал ${channel_id}` }
        }, (err, html) => {
            if (err) {
                logger.error(`Error rendering reviewSettings: ${err.message}\nStack trace:\n${err.stack}`);
                return res.status(500).send('Ошибка при отображении страницы');
            }
            res.send(html);
        });
    } catch (error) {
        logger.error(`Error in review settings: ${error.message}\nStack trace:\n${error.stack}`);
        res.render('reviewSettings', {
            error: 'Ошибка при загрузке настроек',
            settings: null,
            reviewers: [],
            channel: { id: channel_id || 'unknown', name: `Канал ${channel_id || 'unknown'}` }
        }, (err, html) => {
            if (err) {
                logger.error(`Error rendering reviewSettings in catch: ${err.message}\nStack trace:\n${err.stack}`);
                return res.status(500).send('Ошибка при отображении страницы');
            }
            res.send(html);
        });
    }
});

// Включение/отключение автоматического распределения
router.post('/settings/enable', async (req, res) => {
    const { channel_id, review_type } = req.body;

    if (!channel_id) {
        return res.status(400).json({ error: 'Не указан channel_id' });
    }

    if (!['manual', 'queue'].includes(review_type)) {
        return res.status(400).json({ error: 'Неверный тип ревью. Доступные: manual, queue' });
    }

    try {
        const success = await reviewDistributionService.enableAutoDistribution(channel_id, review_type);
        if (success) {
            res.json({ success: true, message: 'Автоматическое распределение включено' });
        } else {
            res.status(500).json({ error: 'Ошибка при включении автоматического распределения' });
        }
    } catch (error) {
        logger.error(`Error enabling auto distribution: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

router.post('/settings/disable', async (req, res) => {
    const { channel_id } = req.body;

    if (!channel_id) {
        return res.status(400).json({ error: 'Не указан channel_id' });
    }

    try {
        const success = await reviewDistributionService.disableAutoDistribution(channel_id);
        if (success) {
            res.json({ success: true, message: 'Автоматическое распределение отключено' });
        } else {
            res.status(500).json({ error: 'Ошибка при отключении автоматического распределения' });
        }
    } catch (error) {
        logger.error(`Error disabling auto distribution: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Добавление ревьюера в очередь
router.post('/settings/reviewer/add', async (req, res) => {
    const { channel_id, username } = req.body;

    if (!channel_id || !username) {
        return res.status(400).json({ error: 'Не указан channel_id или username' });
    }

    try {
        const cleanUsername = username.replace('@', '');
        const user = await getUserByUsername(cleanUsername);

        if (!user) {
            return res.status(404).json({ error: `Пользователь @${cleanUsername} не найден` });
        }

        const currentQueue = await getReviewQueue(channel_id);
        const nextOrder = currentQueue.length;

        await addReviewerToQueue(channel_id, user.id, user.username, nextOrder);
        res.json({ success: true, message: `Пользователь @${user.username} добавлен в очередь` });
    } catch (error) {
        logger.error(`Error adding reviewer: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Удаление ревьюера из очереди
router.post('/settings/reviewer/remove', async (req, res) => {
    const { channel_id, reviewer_id } = req.body;

    if (!channel_id || !reviewer_id) {
        return res.status(400).json({ error: 'Не указан channel_id или reviewer_id' });
    }

    try {
        const result = await removeReviewerFromQueue(parseInt(reviewer_id), channel_id);
        if (result > 0) {
            res.json({ success: true, message: 'Ревьюер удален из очереди' });
        } else {
            res.status(404).json({ error: 'Ревьюер не найден в очереди' });
        }
    } catch (error) {
        logger.error(`Error removing reviewer: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Обновление порядка ревьюеров
router.post('/settings/reviewers/order', async (req, res) => {
    const { channel_id, order } = req.body;

    if (!channel_id || !Array.isArray(order)) {
        return res.status(400).json({ error: 'Не указан channel_id или order' });
    }

    try {
        await updateReviewQueueOrder(channel_id, order.map(id => parseInt(id)));
        res.json({ success: true, message: 'Порядок ревьюеров обновлен' });
    } catch (error) {
        logger.error(`Error updating reviewers order: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Очистка очереди ревьюеров
router.post('/settings/reviewers/clear', async (req, res) => {
    const { channel_id } = req.body;

    if (!channel_id) {
        return res.status(400).json({ error: 'Не указан channel_id' });
    }

    try {
        const result = await clearReviewQueue(channel_id);
        res.json({ success: true, message: `Очередь очищена (удалено: ${result} записей)` });
    } catch (error) {
        logger.error(`Error clearing queue: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Страница для создания ревью (перевод задачи в INREVIEW)
router.get('/', async (req, res) => {
    try {
        const { getMyChannels } = require('../../mattermost/utils');
        const { INREVIEW_CHANNEL_IDS } = require('../../config');

        // Получаем каналы пользователя
        const userChannels = await getMyChannels();

        // Фильтруем только каналы из INREVIEW_CHANNEL_IDS, в которых пользователь состоит
        const availableChannels = [];
        for (const channelId of INREVIEW_CHANNEL_IDS || []) {
            const channel = userChannels.find(ch => ch.id === channelId);
            if (channel) {
                availableChannels.push({
                    id: channel.id,
                    name: channel.display_name || channel.name || channelId
                });
            }
        }

        res.render('review', {
            error: null,
            availableChannels: availableChannels,
            user: req.user
        });
    } catch (error) {
        logger.error(`Error in review page: ${error.message}\nStack trace:\n${error.stack}`);
        res.render('review', {
            error: 'Ошибка при загрузке страницы',
            availableChannels: [],
            user: req.user
        });
    }
});

// API: Получение пользователей канала
router.get('/api/channel-users', async (req, res) => {
    try {
        const { channelId } = req.query;

        if (!channelId) {
            return res.status(400).json({ error: 'Не указан channelId' });
        }

        // Получаем участников канала
        const members = await getChannelMembers(channelId);

        // Получаем детали каждого пользователя
        const users = await Promise.all(
            members.map(async (member) => {
                try {
                    const user = await getUser(member.user_id);

                    // Фильтруем удаленных пользователей (delete_at > 0 означает удаление)
                    if (user.delete_at && user.delete_at > 0) {
                        return null;
                    }

                    // Фильтруем ботов
                    if (user.is_bot === true) {
                        return null;
                    }

                    return {
                        id: user.id,
                        username: user.username,
                        displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
                        email: user.email
                    };
                } catch (err) {
                    logger.warn(`Could not get user ${member.user_id}:`, err);
                    return null;
                }
            })
        );

        // Фильтруем null значения (удаленные пользователи и ошибки) и сортируем по имени
        const validUsers = users.filter(u => u !== null).sort((a, b) =>
            a.displayName.localeCompare(b.displayName)
        );

        res.json({ users: validUsers });
    } catch (error) {
        logger.error(`Error getting channel users: ${error.message}`);
        res.status(500).json({ error: error.message || 'Ошибка при получении пользователей канала' });
    }
});

// API: Отправка сообщения в канал для ревью
router.post('/api/send', async (req, res) => {
    try {
        const { taskKey, mergeRequest, messageText, contentType, reviewer, channelId } = req.body;
        const user_id = req.user?.mattermostUserId;

        // Получаем пользователя из Mattermost по ID из сессии
        let user_name = '@unknown';
        if (user_id) {
            try {
                const mattermostUser = await getUser(user_id);
                if (mattermostUser && mattermostUser.username) {
                    user_name = `@${mattermostUser.username}`;
                }
            } catch (err) {
                logger.warn(`Could not get Mattermost user ${user_id}:`, err);
            }
        }

        if (!taskKey) {
            return res.status(400).json({ error: 'Не указан ключ задачи (taskKey)' });
        }

        if (!channelId) {
            return res.status(400).json({ error: 'Не указан канал (channelId)' });
        }

        // Импортируем необходимые модули
        const reviewCommand = require('../../commands/review');
        const { isUserInChannel } = require('../../commands/review');
        const { getChannelMembers } = require('../../mattermost/utils');

        // Проверяем, состоит ли пользователь в канале
        const members = await getChannelMembers(channelId);
        const userInChannel = members.some(m => m.user_id === user_id);

        if (!userInChannel) {
            return res.status(403).json({ error: 'Вы не состоите в указанном канале' });
        }

        // Вызываем команду review (но без post_id, так как это UI)
        // Нужно адаптировать команду для работы без post_id или создать отдельную функцию

        // Временно используем прямую логику из команды
        const JiraService = require('../../services/jiraService');
        const { getReviewTaskByKey } = require('../../db/models/reviewTask');
        const { postMessage } = require('../../mattermost/utils');
        const reviewDistributionService = require('../../services/reviewDistributionService');
        const JiraStatusType = require('../../types/jiraStatusTypes');
        const { isToDoStatus, isInProgressStatus } = require('../../services/jiraService/jiraHelper');
        const { parseGitlabMrUrl } = require('../../services/gitlabService/gitlabHelper');
        const GitlabService = require('../../services/gitlabService');
        const { addReviewTask, addTaskNotification } = require('../../db/models/reviewTask');

        // Получаем задачу из Jira
        const task = await JiraService.fetchTask(taskKey);
        if (!task) {
            return res.status(404).json({ error: `Задача ${taskKey} не найдена в Jira` });
        }

        // Проверяем существующую запись
        const reviewTask = await getReviewTaskByKey(taskKey);

        // Формируем сообщение в зависимости от типа контента
        let message = `**${JiraStatusType.INREVIEW.toUpperCase()}** [${task.key}](https://jira.parcsis.org/browse/${task.key}) ${task.summary}`;

        if (contentType === 'pr') {
            // Если выбран Pull Request
            const mergeRequestLink = mergeRequest || (task.pullRequests && task.pullRequests.length === 1 ? task.pullRequests[0].url : null);
            if (mergeRequestLink) {
                message += `\n[${mergeRequestLink}](${mergeRequestLink})`;
            }
        } else if (contentType === 'message' && messageText) {
            // Если выбрано сообщение
            message += `\n${messageText}`;
        }

        message += `\nАвтор: ${user_name}`;

        // Обрабатываем ревьювера
        let reviewerResolved = reviewer || null;
        if (!reviewerResolved && Array.isArray(task.reviewers) && task.reviewers.length > 0) {
            // Используем встроенную логику для получения упоминаний ревьюверов
            const GENERIC_REVIEWER_EMAIL = 'caseone@pravo.tech';
            const REVIEWER_NAME_TO_MENTION = {
                'caseone-back': '@c1-back',
                'caseone-tester': '@c1-qa',
                'caseone-frontend': '@c1-front',
                'caseone-analyst': '@c1-analyst',
            };

            const { getUserByEmail } = require('../../mattermost/utils');
            const mentions = [];
            for (const r of task.reviewers) {
                try {
                    const emailLc = (r?.email || '').trim().toLowerCase();
                    const nameLc = (r?.name || '').trim().toLowerCase();

                    let mention = null;
                    if (emailLc === GENERIC_REVIEWER_EMAIL) {
                        mention = REVIEWER_NAME_TO_MENTION[nameLc] || null;
                    } else {
                        const user = await getUserByEmail(emailLc);
                        mention = user ? `@${user.username}` : null;
                    }
                    if (mention) mentions.push(mention);
                } catch (err) {
                    logger.warn(`Не удалось получить пользователя по email ${r?.email}: ${err?.message || err}`);
                }
            }
            if (mentions.length > 0) {
                reviewerResolved = mentions.join(', ');
            }
        }

        // Переводим задачу в статус INREVIEW
        let taskStatus = task.status;
        if (isToDoStatus(taskStatus)) {
            const ok = await JiraService.changeTaskStatus(taskKey, JiraStatusType.INPROGRESS);
            if (ok) {
                taskStatus = JiraStatusType.INPROGRESS;
            }
        }
        if (isInProgressStatus(taskStatus)) {
            const ok = await JiraService.changeTaskStatus(taskKey, JiraStatusType.INREVIEW);
            if (!ok) {
                return res.status(500).json({ error: `Не удалось перевести задачу в статус ${JiraStatusType.INREVIEW}` });
            }
            taskStatus = JiraStatusType.INREVIEW;
        }

        // Если ревьюер не указан, пробуем автоматически назначить
        let messageToPost = message;
        if (!reviewerResolved) {
            const assignedReviewer = await reviewDistributionService.assignReviewerForTask(channelId, taskKey);
            if (assignedReviewer) {
                reviewerResolved = `@${assignedReviewer.user_name}`;
                messageToPost = message + `\nРевьювер: ${reviewerResolved}`;
            }
        } else {
            messageToPost = message + `\nРевьювер: ${reviewerResolved}`;
        }

        // Отправляем сообщение в канал
        const post = await postMessage(channelId, messageToPost);

        // Обрабатываем GitLab merge request (только если contentType === 'pr')
        let gitlabMergeRequestId = null;
        if (contentType === 'pr') {
            const mergeRequestLink = mergeRequest || (task.pullRequests && task.pullRequests.length === 1 ? task.pullRequests[0].url : null);
            if (mergeRequestLink) {
                const mergeRequestData = parseGitlabMrUrl(mergeRequestLink);
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
            }
        }

        // Создаем или обновляем запись reviewTask
        if (reviewTask) {
            // Обновляем существующую запись
            const { updateReviewTaskStatus, updateReviewTaskReviewer } = require('../../db/models/reviewTask');
            await updateReviewTaskStatus({ task_key: taskKey, status: JiraStatusType.INREVIEW });
            if (reviewerResolved) {
                await updateReviewTaskReviewer({ task_key: taskKey, reviewer: reviewerResolved });
            }
            await addTaskNotification(reviewTask.id);
        } else {
            // Создаем новую запись
            const reviewTaskId = await addReviewTask({
                channel_id: channelId,
                post_id: post.id,
                user_id,
                task_key: taskKey,
                merge_request_url: (contentType === 'pr' ? mergeRequest : null) || null,
                reviewer: reviewerResolved,
                gitlab_merge_request_id: gitlabMergeRequestId,
            });
            await addTaskNotification(reviewTaskId);
        }

        res.json({
            success: true,
            message: 'Задача успешно переведена в ревью',
            postId: post.id,
            channelId: channelId
        });
    } catch (error) {
        logger.error(`Error sending review: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ error: error.message || 'Ошибка при отправке ревью' });
    }
});

// API: Предпросмотр сообщения
router.get('/api/preview', async (req, res) => {
    try {
        const { taskKey, mergeRequest, messageText, contentType, reviewer } = req.query;
        const user_id = req.user?.mattermostUserId;

        // Получаем пользователя из Mattermost по ID из сессии
        let user_name = '@unknown';
        if (user_id) {
            try {
                const mattermostUser = await getUser(user_id);
                if (mattermostUser && mattermostUser.username) {
                    user_name = `@${mattermostUser.username}`;
                }
            } catch (err) {
                logger.warn(`Could not get Mattermost user ${user_id}:`, err);
            }
        }

        if (!taskKey) {
            return res.status(400).json({ error: 'Не указан ключ задачи' });
        }

        const JiraService = require('../../services/jiraService');
        const JiraStatusType = require('../../types/jiraStatusTypes');
        const { getUserByEmail } = require('../../mattermost/utils');

        // Получаем задачу из Jira
        const task = await JiraService.fetchTask(taskKey);
        if (!task) {
            return res.status(404).json({ error: `Задача ${taskKey} не найдена в Jira` });
        }

        // Формируем сообщение в зависимости от типа контента
        let message = `**${JiraStatusType.INREVIEW.toUpperCase()}** [${task.key}](https://jira.parcsis.org/browse/${task.key}) ${task.summary}`;

        if (contentType === 'pr') {
            // Если выбран Pull Request
            const mergeRequestLink = mergeRequest || (task.pullRequests && task.pullRequests.length === 1 ? task.pullRequests[0].url : null);
            if (mergeRequestLink) {
                message += `\n[${mergeRequestLink}](${mergeRequestLink})`;
            }
        } else if (contentType === 'message' && messageText) {
            // Если выбрано сообщение
            message += `\n${messageText}`;
        }

        message += `\nАвтор: ${user_name}`;

        // Обрабатываем ревьювера
        let reviewerResolved = reviewer || null;
        if (!reviewerResolved && Array.isArray(task.reviewers) && task.reviewers.length > 0) {
            const GENERIC_REVIEWER_EMAIL = 'caseone@pravo.tech';
            const REVIEWER_NAME_TO_MENTION = {
                'caseone-back': '@c1-back',
                'caseone-tester': '@c1-qa',
                'caseone-frontend': '@c1-front',
                'caseone-analyst': '@c1-analyst',
            };

            const mentions = [];
            for (const r of task.reviewers) {
                try {
                    const emailLc = (r?.email || '').trim().toLowerCase();
                    const nameLc = (r?.name || '').trim().toLowerCase();

                    let mention = null;
                    if (emailLc === GENERIC_REVIEWER_EMAIL) {
                        mention = REVIEWER_NAME_TO_MENTION[nameLc] || null;
                    } else {
                        const user = await getUserByEmail(emailLc);
                        mention = user ? `@${user.username}` : null;
                    }
                    if (mention) mentions.push(mention);
                } catch (err) {
                    logger.warn(`Не удалось получить пользователя по email ${r?.email}: ${err?.message || err}`);
                }
            }
            if (mentions.length > 0) {
                reviewerResolved = mentions.join(', ');
            }
        }

        if (reviewerResolved) {
            message += `\nРевьювер: ${reviewerResolved}`;
        } else {
            message += `\nРевьювер: (будет назначен автоматически)`;
        }

        res.json({ message });
    } catch (error) {
        logger.error(`Error previewing review: ${error.message}`);
        res.status(500).json({ error: error.message || 'Ошибка при создании предпросмотра' });
    }
});

module.exports = router;

