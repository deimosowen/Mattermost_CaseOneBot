const CronJob = require('cron').CronJob;
const { postMessage } = require('../mattermost/utils');
const { getReminders } = require('../db/models/reminders');
const { sendMessage, isApiKeyExist } = require('../chatgpt');
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
        const taskCallback = async () => {
            let channel_id = reminder.channel_id;
            let message = reminder.message;
            try {
                if (reminder.use_open_ai && isApiKeyExist) {
                    const messageFromAI = await sendMessage(reminder.prompt, null);
                    let messageFromAIText = messageFromAI.text;

                    if (messageFromAIText.startsWith('\"') && messageFromAIText.endsWith('\"')) {
                        messageFromAIText = messageFromAIText.slice(1, -1);
                    }
                    if (reminder.template) {
                        message = reminder.template.replace('{messageFromAI}', messageFromAIText);
                    } else {
                        message = messageFromAIText;
                    }
                }
            } catch (error) {
                logger.error(`${error.message}\nStack trace:\n${error.stack}`);
            } finally {
                postMessage(channel_id, message);
            }
        };
        setCronJob(reminder.id, reminder.schedule, taskCallback, TaskType.REMINDER);
    }
};

module.exports = {
    loadCronJobsFromDb,
    setCronJob,
    cancelCronJob,
    CronJob,
};
