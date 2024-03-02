const express = require('express');
const router = express.Router();
const { getSubtasks, logTime } = require('../services/jiraService');

router.get('/:taskId/subtasks', async (req, res) => {
    try {
        const subtasks = await getSubtasks(req.jira, req.params.taskId);
        res.json(subtasks);
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

router.post('/log-time', async (req, res) => {
    try {
        await logTime(req.jira, req.body);
        res.send('Время успешно залогировано');
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

module.exports = router;