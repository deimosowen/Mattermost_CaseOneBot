const express = require('express');
const router = express.Router();
const jiraService = require('../services/jiraService');

router.get('/:taskId', async (req, res) => {
    try {
        const task = await jiraService.getTask(req.jira, req.params.taskId);
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

router.put('/:taskId/status', async (req, res) => {
    try {
        await jiraService.changeStatus(req.jira, req.params.taskId, req.body.status);
        res.send('Статус успешно изменен');
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