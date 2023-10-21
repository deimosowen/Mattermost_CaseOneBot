const CronJob = require('cron').CronJob;
const { postMessage } = require('../mattermost/utils');
const { getReminders } = require('../db/models/reminders');
const logger = require('../logger');
const TaskType = require('../types/taskTypes');

let jobs = {};

const setCronJob = (id, schedule, taskCallback, type) => {
    try {
        const uniqueId = `${type}_${id}`;

        if (jobs[uniqueId]) {
            jobs[uniqueId].stop();
        }

        const task = new CronJob(schedule, taskCallback, null, true, 'UTC');
        task.start();

        jobs[uniqueId] = task;

        return task;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

const cancelCronJob = (id, type) => {
    try {
        const uniqueId = `${type}_${id}`;

        if (jobs[uniqueId]) {
            jobs[uniqueId].stop();
            delete jobs[uniqueId];
            return true;
        } else {
            return false;
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        return false;
    }
};

const loadCronJobsFromDb = async () => {
    const reminders = await getReminders();
    for (const reminder of reminders) {
        const taskCallback = () => postMessage(reminder.channel_id, reminder.message);
        setCronJob(reminder.id, reminder.schedule, taskCallback, TaskType.REMINDER);
    }
};

module.exports = {
    loadCronJobsFromDb,
    setCronJob,
    cancelCronJob,
    CronJob,
};
