const express = require('express');
const moment = require('moment');
const { getSubtasks, logTime } = require('../../jira/index');
const { getUserNotifiedEvents, setNotifiedEventAsLogged } = require('../../db/models/calendars');
const { JIRA_ROOT_TASK_ID } = require('../../config');
const JiraService = require('../../services/jiraService');
const reviewManager = require('../../services/reviewService');
const logger = require('../../logger');

const router = express.Router();

router.get('/', async (req, res) => {
    const { user_id } = req.query;
    try {
        let events = await getUserNotifiedEvents(user_id);
        events = events.map(event => {
            const startDate = moment(event.start_date);
            const endDate = moment(event.end_date);
            const duration = moment.duration(endDate.diff(startDate)).asMinutes();
            const timezoneOffset = moment.parseZone(event.start_date).utcOffset();
            const adjustedStartDate = startDate.add(timezoneOffset, 'minutes');
            return {
                ...event,
                start: adjustedStartDate.format('YYYY-MM-DD HH:mm'),
                duration: `${Math.round(duration)}`
            };
        });
        res.render('jiraWorklog', { user_id, events });
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
});

router.post('/log', async (req, res) => {
    const { id, userId, taskId, started, duration, comment } = req.body;
    const authHeader = req.headers['authorization'];
    try {
        await logTime({ taskId, started, duration, comment }, authHeader);
        await setNotifiedEventAsLogged(id);
        res.status(200).json({ redirectUrl: `/jira?user_id=${userId}&save` });
    } catch (error) {
        res.status(500).json({ redirectUrl: `/jira?user_id=${userId}&error` });
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
});

router.post('/remove', async (req, res) => {
    const { id, userId } = req.body;
    try {
        await setNotifiedEventAsLogged(id);
        res.status(200).json({ redirectUrl: `/jira?user_id=${userId}&remove` });
    } catch (error) {
        res.status(500).json({});
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
});

router.post('/api/tasks', async (req, res) => {
    const authHeader = req.headers['authorization'];
    try {
        var tasks = await getSubtasks(JIRA_ROOT_TASK_ID, authHeader);
        res.status(200).json(tasks);
    } catch (error) {
        res.status(500);
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
});

router.get('/api/review', async (req, res) => {
    const { taskKey, userName } = req.query;
    try {
        await new Promise(resolve => setTimeout(resolve, 7000));
        const result = await reviewManager.handleReviewCommand({ taskKey, userName });
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
});

router.get('/api/tasks/search', async (req, res) => {
    const q = (req.query.q || '').trim().toUpperCase();
    if (!q) return res.json([]);

    try {
        const task = await JiraService.fetchTask(q);
        if (!task) {
            return res.json([]);
        }

        const pullRequests = task.pullRequests || [];
        const urls = {
            backUrl: null,
            frontUrl: null,
            aqaUrl: null
        };

        for (const pr of pullRequests) {
            const url = pr.url?.toLowerCase();
            if (!url) continue;

            for (const pr of pullRequests) {
                const url = pr.url?.toLowerCase();
                if (!url) continue;

                if (url.includes('casepro.front') || url.includes('frontend')) {
                    urls.frontUrl = pr.url;
                    continue;
                }

                if (url.includes('autotest') ||
                    url.includes('/qa/') ||
                    url.includes('qa/')) {
                    urls.aqaUrl = pr.url;
                    continue;
                }

                if (url.includes('casepro')) {
                    urls.backUrl = pr.url;
                }
            }
        }

        const result = {
            id: task.key,
            name: task.summary || task.fields?.summary || '',
            ...urls
        };

        res.json([result]);
    } catch (error) {
        console.error(`[JiraAPI] Ошибка при поиске задачи ${req.query.q}:`, error);
        res.status(500).json({ error: 'Ошибка при получении данных из Jira' });
    }
});

module.exports = router;