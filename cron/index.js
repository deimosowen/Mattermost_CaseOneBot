const CronJob = require('cron').CronJob;
const { postMessage } = require('../mattermost/utils');
const { getReminders } = require('../db/reminders');

let jobs = {};

const setCronJob = (id, schedule, channel_id, message) => {
    try {
        if (jobs[id]) {
            jobs[id].stop();
        }

        const task = new CronJob(schedule, () => {
            postMessage(channel_id, message);
        }, null, true, 'UTC');

        task.start();

        jobs[id] = task;

        return task;
    } catch (e) {
        console.error(e);
    }
};

const cancelCronJob = (id) => {
    try {
        if (jobs[id]) {
            jobs[id].stop();
            delete jobs[id];
            return true;
        } else {
            return false;
        }
    } catch (e) {
        console.error(e);
        return false;
    }
};

const loadCronJobsFromDb = async () => {
    const reminders = await getReminders();
    for (const reminder of reminders) {
        setCronJob(reminder.id, reminder.schedule, reminder.channel_id, reminder.message);
    }
};

module.exports = {
    loadCronJobsFromDb,
    setCronJob,
    cancelCronJob,
    CronJob,
};
