const express = require('express');
const reviewDistributionService = require('../../services/reviewDistributionService');
const { getReviewQueue, addReviewerToQueue, removeReviewerFromQueue, updateReviewQueueOrder, clearReviewQueue } = require('../../db/models/reviewQueue');
const { getChannelById, getUserByUsername, getChannelMembers, getUser, postMessage } = require('../../mattermost/utils');
const {
    getAvailableReviewChannelsForUser,
    getEnabledReviewChannelIdsForUser
} = require('../../services/reviewChannelAvailabilityService');
const JiraService = require('../../services/jiraService');
const reviewTaskService = require('../../services/reviewTaskService');
const JiraStatusType = require('../../types/jiraStatusTypes');
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

// Сохранение всех настроек ревью канала (включая архитектурное ревью)
router.post('/settings/save', async (req, res) => {
    const { channel_id, is_enabled, review_type, allow_arch_review, arch_review_tag } = req.body;

    if (!channel_id) {
        return res.status(400).json({ error: 'Не указан channel_id' });
    }

    if (review_type && !['manual', 'queue'].includes(review_type)) {
        return res.status(400).json({ error: 'Неверный тип ревью. Доступные: manual, queue' });
    }

    try {
        const success = await reviewDistributionService.saveChannelSettings(channel_id, {
            is_enabled: Boolean(is_enabled),
            review_type: review_type || 'manual',
            allow_arch_review: Boolean(allow_arch_review),
            arch_review_tag: (arch_review_tag != null && arch_review_tag !== undefined) ? String(arch_review_tag).trim() : ''
        });
        if (success) {
            res.json({ success: true, message: 'Настройки сохранены' });
        } else {
            res.status(500).json({ error: 'Ошибка при сохранении настроек' });
        }
    } catch (error) {
        logger.error(`Error saving review settings: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// API: настройки канала для страницы ревью (архитектурное ревью и тег)
router.get('/api/channel-settings', async (req, res) => {
    try {
        const { channel_id } = req.query;
        if (!channel_id) {
            return res.status(400).json({ error: 'Не указан channel_id' });
        }
        const settings = await reviewDistributionService.getChannelSettings(channel_id);
        res.json({
            allow_arch_review: Boolean(settings?.allow_arch_review),
            arch_review_tag: settings?.arch_review_tag || ''
        });
    } catch (error) {
        logger.error(`Error getting channel settings: ${error.message}`);
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
        const user_id = req.user?.mattermostUserId;

        if (!user_id) {
            return res.render('review', {
                error: 'Не удалось определить пользователя. Пожалуйста, войдите в систему.',
                availableChannels: [],
                user: req.user
            });
        }

        const availableChannels = await getAvailableReviewChannelsForUser(user_id, {
            includeExcluded: false,
            includeNames: true
        });

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

// API: Получение задач пользователя
router.get('/api/user-tasks', async (req, res) => {
    try {
        const user_id = req.user?.mattermostUserId;
        const { search } = req.query;

        if (!user_id) {
            return res.status(401).json({ error: 'Пользователь не авторизован' });
        }

        // Получаем данные пользователя из Mattermost
        let userEmail = null;
        let username = null;
        try {
            const mattermostUser = await getUser(user_id);
            userEmail = mattermostUser?.email;
            username = mattermostUser?.username;
            logger.debug(`User data: email=${userEmail}, username=${username}`);
        } catch (err) {
            logger.warn(`Could not get Mattermost user ${user_id}:`, err);
            // Не возвращаем ошибку сразу, попробуем использовать альтернативный подход
            logger.warn('Will try to search tasks without user filter');
        }

        if (!userEmail && !username) {
            logger.warn('No user email or username available, will try alternative search');
        }

        // Формируем JQL запрос - пробуем несколько вариантов
        // Сначала пробуем username, так как это самый надежный способ
        let jql;
        const searchTerm = search && search.trim() ? search.trim().toUpperCase() : null;

        // Проверяем, является ли searchTerm точным ключом задачи (например, CASEM-123)
        const isExactTaskKey = searchTerm && /^(CASEM|REN)-\d+$/.test(searchTerm);

        // Если это точный ключ задачи, сначала пробуем найти задачу без фильтров по assignee и статусу
        if (isExactTaskKey) {
            try {
                logger.debug(`Searching for exact task key: ${searchTerm} without filters`);
                const exactTaskJql = `key = "${searchTerm}"`;
                const exactTasks = await JiraService.searchTasksByJql(exactTaskJql, 1);

                if (Array.isArray(exactTasks) && exactTasks.length > 0) {
                    // Задача найдена, возвращаем её без фильтров
                    const formattedTasks = exactTasks.map(task => ({
                        value: task.key,
                        text: `${task.key}: ${task.summary}`,
                        key: task.key,
                        summary: task.summary,
                        status: task.status
                    }));
                    logger.debug(`Found exact task: ${searchTerm}`);
                    return res.json({ tasks: formattedTasks });
                }
            } catch (error) {
                logger.debug(`Could not find exact task ${searchTerm}, will try with filters: ${error.message}`);
            }
        }

        // Пробуем разные варианты JQL запросов с фильтрами
        const jqlVariants = [];

        if (username) {
            // Вариант 1: поиск по username (самый надежный)
            if (searchTerm) {
                jqlVariants.push(`(assignee = "${username}" AND status = "In Progress" AND (key ~ "${searchTerm}" OR summary ~ "${searchTerm}")) ORDER BY updated DESC`);
            } else {
                jqlVariants.push(`assignee = "${username}" AND status = "In Progress" ORDER BY updated DESC`);
            }
        }

        if (userEmail) {
            // Вариант 2: поиск по email (может не работать в некоторых версиях Jira)
            if (searchTerm) {
                jqlVariants.push(`(assignee.emailAddress = "${userEmail}" AND status = "In Progress" AND (key ~ "${searchTerm}" OR summary ~ "${searchTerm}")) ORDER BY updated DESC`);
                // Вариант 3: поиск по email с использованием ~ (contains)
                jqlVariants.push(`(assignee.emailAddress ~ "${userEmail}" AND status = "In Progress" AND (key ~ "${searchTerm}" OR summary ~ "${searchTerm}")) ORDER BY updated DESC`);
            } else {
                jqlVariants.push(`assignee.emailAddress = "${userEmail}" AND status = "In Progress" ORDER BY updated DESC`);
                jqlVariants.push(`assignee.emailAddress ~ "${userEmail}" AND status = "In Progress" ORDER BY updated DESC`);
            }
        }

        // Пробуем выполнить запросы по очереди, пока не найдем рабочий
        let tasks = [];
        let lastError = null;

        for (const jqlQuery of jqlVariants) {
            try {
                logger.debug(`Trying JQL: ${jqlQuery}`);
                tasks = await JiraService.searchTasksByJql(jqlQuery, 50);

                if (Array.isArray(tasks) && tasks.length > 0) {
                    logger.debug(`Success with JQL, found ${tasks.length} tasks`);
                    break;
                }
            } catch (error) {
                lastError = error;
                logger.debug(`JQL query failed: ${jqlQuery}, error: ${error.message}`);
                continue;
            }
        }

        // Если не нашли задачи по assignee, пробуем альтернативный подход:
        // Получаем все задачи в статусе In Progress и фильтруем на стороне сервера
        if ((!Array.isArray(tasks) || tasks.length === 0) && (userEmail || username)) {
            logger.debug('Trying alternative approach: get all In Progress tasks and filter by assignee');
            try {
                const allTasksJql = searchTerm
                    ? `status = "In Progress" AND (key ~ "${searchTerm}" OR summary ~ "${searchTerm}") ORDER BY updated DESC`
                    : `status = "In Progress" ORDER BY updated DESC`;

                const allTasks = await JiraService.searchTasksByJql(allTasksJql, 100);

                if (Array.isArray(allTasks) && allTasks.length > 0) {
                    // Фильтруем задачи по assignee
                    tasks = allTasks.filter(task => {
                        if (!task.assignee) return false;
                        const assigneeEmail = task.assignee.email?.toLowerCase();
                        const assigneeUsername = task.assignee.username?.toLowerCase();
                        const userEmailLower = userEmail?.toLowerCase();
                        const usernameLower = username?.toLowerCase();

                        return (userEmailLower && assigneeEmail === userEmailLower) ||
                            (usernameLower && assigneeUsername === usernameLower);
                    });

                    logger.debug(`Filtered ${tasks.length} tasks from ${allTasks.length} total tasks`);
                }
            } catch (error) {
                logger.warn(`Alternative search also failed: ${error.message}`);
            }
        }

        if (!Array.isArray(tasks) || tasks.length === 0) {
            logger.warn(`No tasks found. Tried ${jqlVariants.length} JQL variants. Last error: ${lastError?.message || 'No tasks found'}`);
        }

        // Проверяем, что tasks - это массив
        if (!Array.isArray(tasks)) {
            logger.warn(`Unexpected tasks format: ${typeof tasks}`);
            return res.json({ tasks: [] });
        }

        // Форматируем результат для Tom Select
        const formattedTasks = tasks.map(task => ({
            value: task.key,
            text: `${task.key}: ${task.summary}`,
            key: task.key,
            summary: task.summary,
            status: task.status
        }));

        res.json({ tasks: formattedTasks });
    } catch (error) {
        logger.error(`Error getting user tasks: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ error: error.message || 'Ошибка при получении задач' });
    }
});

// API: Получение деталей задачи с Merge Request
router.get('/api/task-details', async (req, res) => {
    try {
        const { taskKey } = req.query;

        if (!taskKey) {
            return res.status(400).json({ error: 'Не указан ключ задачи' });
        }

        // Получаем задачу из Jira
        const task = await JiraService.fetchTask(taskKey);
        if (!task) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        // Извлекаем Merge Request URL из pullRequests
        const pullRequests = task.pullRequests || [];
        const mergeRequestUrls = (pullRequests || []).map(pr => ({
            url: pr.url,
            title: pr.sourceBranch || pr.title || pr.url
        }));
        const mergeRequestUrl = mergeRequestUrls.length === 1 ? mergeRequestUrls[0].url : null;

        res.json({
            taskKey: task.key,
            summary: task.summary,
            status: task.status,
            mergeRequestUrl: mergeRequestUrl,
            mergeRequestUrls: mergeRequestUrls
        });
    } catch (error) {
        logger.error(`Error getting task details: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ error: error.message || 'Ошибка при получении деталей задачи' });
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
        const { taskKey, mergeRequest, messageText, contentType, reviewer, channelId, reviewType, archReviewTag } = req.body;
        const isArchReview = reviewType === 'arch';
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

        const availableChannelIds = await getEnabledReviewChannelIdsForUser(user_id);
        const userInChannel = availableChannelIds.includes(channelId);

        if (!userInChannel) {
            return res.status(403).json({ error: 'Канал недоступен для отправки ревью' });
        }

        // Используем сервис для обработки ревью
        // Получаем задачу из Jira
        const task = await JiraService.fetchTask(taskKey);
        if (!task) {
            return res.status(404).json({ error: `Задача ${taskKey} не найдена в Jira` });
        }

        // Получаем merge request URL
        const mergeRequestLink = contentType === 'pr'
            ? (mergeRequest || reviewTaskService.getMergeRequestUrl(task, null))
            : null;

        // Формируем сообщение (для архитектурного ревью — IN ARCH-REVIEW и тег вместо ревьюверов)
        const message = await reviewTaskService.prepareReviewMessage(
            task,
            mergeRequestLink,
            user_name,
            isArchReview ? null : reviewer,
            messageText,
            contentType,
            isArchReview,
            isArchReview ? (archReviewTag || '').trim() : null
        );

        // Переводим задачу в статус INREVIEW
        const moveResult = await reviewTaskService.moveTaskToInReview(taskKey, task.status);
        if (!moveResult.ok) {
            return res.status(500).json({ error: `Не удалось перевести задачу в статус ${JiraStatusType.INREVIEW}` });
        }

        // Для архитектурного ревью тег уже в сообщении; для обычного — резолвим ревьювера
        let messageToPost = message;
        let reviewerResolved = null;
        if (!isArchReview) {
            reviewerResolved = await reviewTaskService.getReviewer(reviewer, task);
            if (!reviewerResolved) {
                reviewerResolved = await reviewTaskService.assignReviewerAutomatically(channelId, taskKey);
                if (reviewerResolved) {
                    messageToPost = message + `\nРевьювер: ${reviewerResolved}`;
                }
            } else if (!message.includes('Ревьювер')) {
                messageToPost = message + `\nРевьювер: ${reviewerResolved}`;
            }
        }

        // Отправляем сообщение в канал
        const post = await postMessage(channelId, messageToPost);

        // Обрабатываем GitLab merge request
        const gitlabMergeRequestId = await reviewTaskService.processGitlabMergeRequest(mergeRequestLink);

        // Создаем или обновляем запись reviewTask
        await reviewTaskService.createOrUpdateReviewTask({
            taskKey,
            channelId,
            postId: post.id,
            userId: user_id,
            mergeRequestUrl: contentType === 'pr' ? mergeRequestLink : null,
            reviewer: reviewerResolved,
            gitlabMergeRequestId,
        });

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
        const { taskKey, mergeRequest, messageText, contentType, reviewer, reviewType, archReviewTag } = req.query;
        const isArchReview = reviewType === 'arch';
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

        // Получаем задачу из Jira
        const task = await JiraService.fetchTask(taskKey);
        if (!task) {
            return res.status(404).json({ error: `Задача ${taskKey} не найдена в Jira` });
        }

        // Получаем merge request URL
        const mergeRequestLink = contentType === 'pr'
            ? (mergeRequest || reviewTaskService.getMergeRequestUrl(task, null))
            : null;

        // Формируем сообщение
        let message = await reviewTaskService.prepareReviewMessage(
            task,
            mergeRequestLink,
            user_name,
            isArchReview ? null : reviewer,
            messageText,
            contentType,
            isArchReview,
            isArchReview ? (archReviewTag || '').trim() : null
        );

        if (!isArchReview) {
            const reviewerResolved = await reviewTaskService.getReviewer(reviewer, task);
            if (reviewerResolved) {
                if (!message.includes('Ревьювер')) {
                    message += `\nРевьювер: ${reviewerResolved}`;
                }
            } else {
                message += `\nРевьювер: (будет назначен автоматически)`;
            }
        }

        res.json({ message });
    } catch (error) {
        logger.error(`Error previewing review: ${error.message}`);
        res.status(500).json({ error: error.message || 'Ошибка при создании предпросмотра' });
    }
});

module.exports = router;
