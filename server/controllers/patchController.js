const express = require('express');
const PatchService = require('../../services/patchService');
const JiraService = require('../../services/jiraService');
const logger = require('../../logger');

const router = express.Router();

router.get('/', async (req, res) => {
    const { status, taskId } = req.query;
    try {
        const user_id = req.query.user_id || req.user?.mattermostUserId;
        if (!user_id) {
            return res.status(400).send('User ID is required');
        }

        // Если передан taskId, получаем данные задачи
        let taskData = null;
        if (taskId) {
            try {
                const task = await JiraService.fetchTask(taskId);
                if (task) {
                    taskData = {
                        taskId: task.key,
                        taskName: task.summary,
                        fixVersions: task.fixVersions || [],
                        dependencies: task.dependencies || []
                    };
                }
            } catch (error) {
                logger.warn(`Не удалось загрузить данные задачи ${taskId}: ${error.message}`);
            }
        }

        res.render('patchForm', { user_id, status: status, taskData });
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/create', async (req, res) => {
    try {
        const data = {
            taskId: req.body.taskId?.trim(),
            backVersion: req.body.backVersion?.trim() || null,
            frontVersion: req.body.frontVersion?.trim() || null,
            buildMessageLink: req.body.buildMessageLink?.trim() || null,
            subtasks: Array.isArray(req.body.subtasks)
                ? req.body.subtasks.filter(st => st && st.trim())
                : req.body.subtasks
                    ? [req.body.subtasks].filter(st => st && st.trim())
                    : [],
            comment: req.body.comment?.trim() || null
        };

        const result = await PatchService.handlePatchMessage(data);

        res.redirect(`/patch?status=${result.status}`);
    } catch (err) {
        logger.error('Ошибка обработки формы /patch/create:', err);
        res.redirect('/patch?status=error');
    }
});

// API для получения задач патча
router.get('/api/patch-tasks', async (req, res) => {
    try {
        const { search } = req.query;
        const searchTerm = search && search.trim() ? search.trim().toUpperCase() : null;

        // Проверяем, является ли searchTerm точным ключом задачи (например, CASEM-123)
        const isExactTaskKey = searchTerm && /^(CASEM|REN)-\d+$/.test(searchTerm);

        // Если это точный ключ задачи, сначала пробуем найти задачу без фильтров
        if (isExactTaskKey) {
            try {
                const exactTaskJql = `key = "${searchTerm}"`;
                const exactTasks = await JiraService.searchTasksByJql(exactTaskJql, 1);

                if (Array.isArray(exactTasks) && exactTasks.length > 0) {
                    const formattedTasks = exactTasks.map(task => ({
                        value: task.key,
                        text: `${task.key}: ${task.summary}`,
                        key: task.key,
                        summary: task.summary,
                        status: task.status
                    }));
                    return res.json({ tasks: formattedTasks });
                }
            } catch (error) {
                logger.debug(`Could not find exact task ${searchTerm}, will try with filters: ${error.message}`);
            }
        }

        // Ищем задачи патча: название начинается с "Собрать и выпустить патч" и статус не закрыт
        // Исключаем закрытые статусы: Done, Closed, Resolved
        let jql;
        if (searchTerm) {
            // Если есть поисковый запрос, ищем по ключу или названию
            jql = `(summary ~ "Собрать и выпустить патч*" AND status NOT IN (Done, Closed, Resolved) AND (key ~ "${searchTerm}" OR summary ~ "${searchTerm}")) ORDER BY updated DESC`;
        } else {
            // Без поиска - просто все задачи патча
            jql = `summary ~ "Собрать и выпустить патч*" AND status NOT IN (Done, Closed, Resolved) ORDER BY updated DESC`;
        }

        const tasks = await JiraService.searchTasksByJql(jql, 50);

        const formattedTasks = (tasks || []).map(task => ({
            value: task.key,
            text: `${task.key}: ${task.summary}`,
            key: task.key,
            summary: task.summary,
            status: task.status
        }));

        res.json({ tasks: formattedTasks });
    } catch (error) {
        logger.error(`Error getting patch tasks: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ error: error.message || 'Ошибка при получении задач патча' });
    }
});

// API для получения данных задачи
router.get('/api/task/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;

        const task = await JiraService.fetchTask(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }
        console.log(JSON.stringify(task, null, 2));
        const responseData = {
            taskId: task.key,
            taskName: task.summary,
            description: task.description,
            fixVersions: task.fixVersions || [],
            dependencies: task.dependencies || [],
            comments: task.comments || []
        };

        // Логируем для отладки
        logger.debug(`Task ${taskId} dependencies:`, JSON.stringify(responseData.dependencies));

        res.json(responseData);
    } catch (error) {
        logger.error(`Error getting task details: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ error: error.message || 'Ошибка при получении данных из Jira' });
    }
});

module.exports = router;
