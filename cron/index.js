const { CronJob } = require('cron');
const dayOffAPI = require('isdayoff')();
const { wsClient } = require('../mattermost/client');
const { postMessage } = require('../mattermost/utils');
const { getReminders } = require('../db/models/reminders');
const { getDutySchedules } = require('../db/models/duty');
const { sendMessage, isApiKeyExist } = require('../chatgpt');
const { createDutyCallback } = require('../services/dutyService');
const openAiHelpers = require('../chatgpt/helpers');
const mattermostHelpers = require('../mattermost/fileHelper');
const logger = require('../logger');
const TaskType = require('../types/taskTypes');

const WS_PING_CHANNEL_ID = 'dutk7ninhtg7bgwhsht6ijfxpw';
const WS_PING_TIMEOUT_MS = 5000;
const CRON_TZ = 'UTC';

const jobs = Object.create(null);

/* ===========================
 * Helpers
 * =========================== */

const jobKey = (type, id) => `${type}_${id}`;

function createCronJob(schedule, callback) {
    return new CronJob(schedule, callback, null, false, CRON_TZ);
}

function replaceCronJob(key, schedule, callback) {
    try {
        if (jobs[key]) {
            jobs[key].stop();
        }
        const job = createCronJob(schedule, callback);
        job.start();
        jobs[key] = job;
        return job;
    } catch (error) {
        logger.error(`Cron error: ${error.message}\nStack trace:\n${error.stack}`);
        return null;
    }
}

async function sendReminderOnce(reminder) {
    let channel_id = reminder.channel_id;
    let message = reminder.message;
    let file_id;

    const post = async () => {
        try {
            await postMessage(channel_id, message, null, [file_id]);
        } catch (error) {
            logger.error(`postMessage failed: ${error.message}\nStack trace:\n${error.stack}`);
        }
    };

    try {
        if (reminder.use_open_ai && isApiKeyExist) {
            const messageFromAI = await sendMessage(reminder.prompt, null, null, usePersonality = false);
            let messageFromAIText = messageFromAI.text;

            if (reminder.is_generate_image) {
                const prompt = `${reminder.generate_image_prompt}`;
                const generateImage = await openAiHelpers.generateImages({ prompt });
                const file = await mattermostHelpers.uploadFileBase64(generateImage.b64_json, channel_id);
                if (file?.file_infos?.[0]?.id) {
                    file_id = file.file_infos[0].id;
                }
            }

            if (messageFromAIText.startsWith('\"') && messageFromAIText.endsWith('\"')) {
                messageFromAIText = messageFromAIText.slice(1, -1);
            }
            message = reminder.template
                ? reminder.template.replace('{messageFromAI}', messageFromAIText)
                : messageFromAIText;
        }
    } catch (error) {
        logger.error(`Reminder AI branch error: ${error.message}\nStack trace:\n${error.stack}`);
    } finally {
        await post();
    }
}

async function shouldSendByWorkingDaysFlag(useWorkingDays) {
    if (!useWorkingDays) return true;
    try {
        const isHoliday = await dayOffAPI.today();
        return !isHoliday;
    } catch (error) {
        logger.error(`isdayoff error: ${error.message}\nStack trace:\n${error.stack}`);
        return true;
    }
}

/* ===========================
 * Public API
 * =========================== */

const setCronJob = (id, schedule, taskCallback, type) => {
    const key = jobKey(type, id);
    return replaceCronJob(key, schedule, taskCallback);
};

const cancelCronJob = (id, type) => {
    try {
        const key = jobKey(type, id);
        const job = jobs[key];
        if (!job) return false;
        job.stop();
        delete jobs[key];
        return true;
    } catch (error) {
        logger.error(`cancelCronJob error: ${error.message}\nStack trace:\n${error.stack}`);
        return false;
    }
};

const stopAllCronJobs = () => {
    try {
        Object.keys(jobs).forEach((key) => {
            try {
                jobs[key].stop();
            } catch (e) {
                logger.warn(`stopAllCronJobs: job "${key}" stop error: ${e?.message || e}`);
            } finally {
                delete jobs[key];
            }
        });
        return true;
    } catch (error) {
        logger.error(`stopAllCronJobs error: ${error.message}\nStack trace:\n${error.stack}`);
        return false;
    }
};

const loadCronJobsFromDb = async () => {
    const reminders = await getReminders();
    for (const reminder of reminders) {
        const taskCallback = async () => {
            try {
                if (await shouldSendByWorkingDaysFlag(reminder.use_working_days)) {
                    await sendReminderOnce(reminder);
                }
            } catch (error) {
                logger.error(`Reminder task error (id=${reminder.id}): ${error.message}\nStack trace:\n${error.stack}`);
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

const pingWebSocket = () => {
    let pingReceived = false;

    try {
        const timeout = setTimeout(() => {
            if (!pingReceived) {
                const msg = 'WebSocket ping response not received in time.';
                logger.error(msg);
                postMessage(WS_PING_CHANNEL_ID, msg);
            }
        }, WS_PING_TIMEOUT_MS);

        wsClient.getStatuses(() => {
            pingReceived = true;
            clearTimeout(timeout);
        });
    } catch (error) {
        const msg = `WebSocket ping failed: ${error.message}`;
        logger.error(`${msg}\nStack trace:\n${error.stack}`);
        postMessage(WS_PING_CHANNEL_ID, msg);
    }
};

const startPingCronJob = () => {
    try {
        const pingCronJob = new CronJob('*/1 * * * *', pingWebSocket, null, true, CRON_TZ);
        pingCronJob.start();
    } catch (error) {
        logger.error(`startPingCronJob error: ${error.message}\nStack trace:\n${error.stack}`);
    }
};

module.exports = {
    loadCronJobsFromDb,
    loadDutyCronJobsFromDb,
    startPingCronJob,
    setCronJob,
    cancelCronJob,
    stopAllCronJobs,
    CronJob,
};
