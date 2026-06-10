const express = require('express');
const router = express.Router();
const jiraService = require('../services/jiraService');

// Роут /search должен быть ПЕРЕД /:taskId, иначе "search" будет интерпретироваться как taskId
router.get('/search', async (req, res) => {
    try {
        const { jql, maxResults } = req.query;
        if (!jql) {
            return res.status(400).json({ error: 'JQL query is required' });
        }
        const tasks = await jiraService.searchTasks(req.jira, jql, parseInt(maxResults) || 50);
        res.json(tasks);
    } catch (error) {
        // Логируем детали ошибки
        console.error('Error in /search route:', {
            message: error.message,
            errorMessages: error.errorMessages,
            errors: error.errors,
            stack: error.stack
        });
        
        // Возвращаем детали ошибки в ответе
        const errorResponse = {
            error: error.message || 'Unknown error',
            errorMessages: error.errorMessages,
            errors: error.errors
        };
        
        res.status(500).json(errorResponse);
    }
});

router.post('/worklog-report', async (req, res) => {
    try {
        const report = await jiraService.getWorklogReport(req.jira, req.body || {}, req.headers.authorization);
        res.json(report);
    } catch (error) {
        console.error('Error in /worklog-report route:', {
            message: error.message,
            errorMessages: error.errorMessages,
            errors: error.errors,
            stack: error.stack
        });
        res.status(500).json({
            error: error.message || 'Unknown error',
            errorMessages: error.errorMessages,
            errors: error.errors
        });
    }
});

router.get('/:taskId', async (req, res) => {
    try {
        const task = await jiraService.getTask(req.jira, req.params.taskId);
        if (!task) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }
        res.json(task);
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

router.get('/:taskId/parent', async (req, res) => {
    try {
        const subtasks = await jiraService.getTaskParent(req.jira, req.params.taskId);
        res.json(subtasks);
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

router.get('/:taskId/subtasks', async (req, res) => {
    try {
        const subtasks = await jiraService.getSubtasks(req.jira, req.params.taskId);
        res.json(subtasks);
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

router.get('/:taskId/worklogs', async (req, res) => {
    try {
        const worklogs = await jiraService.getIssueWorklogs(req.jira, req.params.taskId);
        res.json(worklogs);
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

router.put('/:taskId/status', async (req, res) => {
    try {
        await jiraService.changeStatus(req.jira, req.params.taskId, req.body.status);
        res.send('Статус успешно изменен');
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

router.post('/:taskId/comments', async (req, res) => {
    try {
        await jiraService.addComment(req.jira, req.params.taskId, req.body.comment);
        res.send('Комментарий успешно добавлен');
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

router.post('/:taskId/reviewers', async (req, res) => {
    try {
        await jiraService.setReviewers(req.jira, req.params.taskId, req.body.reviewers);
        res.send('Рецензенты успешно установлены');
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

router.post('/log-time', async (req, res) => {
    try {
        await jiraService.logTime(req.jira, req.body);
        res.send('Время успешно залогировано');
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

module.exports = router;
