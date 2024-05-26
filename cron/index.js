const CronJob = require('cron').CronJob;
const dayOffAPI = require('isdayoff')();
const { postMessage } = require('../mattermost/utils');
const { getReminders } = require('../db/models/reminders');
const { getDutySchedules } = require('../db/models/duty');
const { sendMessage, isApiKeyExist } = require('../chatgpt');
const { createDutyCallback } = require('../services/dutyService');
const openAiHelpers = require('../chatgpt/helpers');
const mattermostHelpers = require('../mattermost/fileHelper');
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
            let file_id;

            const sendReminder = async () => {
                try {
                    if (reminder.use_open_ai && isApiKeyExist) {
                        const messageFromAI = await sendMessage(reminder.prompt, null, null, usePersonality = false);
                        let messageFromAIText = messageFromAI.text;

                        if (reminder.is_generate_image) {
                            const prompt = `${reminder.generate_image_prompt}: ${messageFromAIText}`;
                            const generateImage = await openAiHelpers.generateImages({ prompt });
                            const file = await mattermostHelpers.uploadFileBase64(generateImage.b64_json, channel_id);
                            file_id = file.file_infos[0].id;
                        }

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
                    postMessage(channel_id, message, null, [file_id]);
                }
            };

            if (reminder.use_working_days) {
                const isHoliday = await dayOffAPI.today();
                if (!isHoliday) {
                    sendReminder();
                }
            } else {
                sendReminder();
            }
        };
        setCronJob(reminder.id, reminder.schedule, taskCallback, TaskType.REMINDER);
    }
};

const loadDutyCronJobsFromDb = async () => {
    const dutySchedules = await getDutySchedules();
    for (const duty of dutySchedules) {
        const taskCallback = createDutyCallback(duty.channel_id, duty.use_working_days);
        setCronJob(duty.id, duty.cron_schedule, taskCallback, TaskType.DUTY);
    }
};

module.exports = {
    loadCronJobsFromDb,
    loadDutyCronJobsFromDb,
    setCronJob,
    cancelCronJob,
    CronJob,
};
