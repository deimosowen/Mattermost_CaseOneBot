const express = require('express');
const moment = require('moment');
const { getSubtasks, logTime } = require('../../jira/index');
const { getUserNotifiedEvents, setNotifiedEventAsLogged } = require('../../db/models/calendars');
const { JIRA_ROOT_TASK_ID } = require('../../config');
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

module.exports = router;