const cronValidator = require('cron-validator');
const { setDutySchedule, addDutyUser, getDutySchedule,
    getDutySchedules, getDutyUsers, setCurrentDuty,
    getCurrentDuty, deleteDutySchedule, deleteAllDutyUsers,
    deleteCurrentDuty } = require('../../db/models/duty');
const { setCronJob, cancelCronJob } = require('../../cron');
const { postMessage } = require('../../mattermost/utils');
const TaskType = require('../../types/taskTypes');
const logger = require('../../logger');
const resources = require('../../resources.json').duty;

const createDutyCallback = (channel_id) => {
    return async () => {
        let users = await getDutyUsers(channel_id);
        users = users.filter(user => !user.is_disabled);
        const currentDuty = await getCurrentDuty(channel_id);

        let nextIndex = (users.findIndex(u => u.user_id === currentDuty.user_id) + 1) % users.length;
        await setCurrentDuty(channel_id, users[nextIndex].user_id);
        postMessage(channel_id, resources.nextNotification.replace('{user}', users[nextIndex].user_id));
    };
};

const loadDutyCronJobsFromDb = async () => {
    const dutySchedules = await getDutySchedules();
    for (const duty of dutySchedules) {
        const taskCallback = createDutyCallback(duty.channel_id);
        setCronJob(duty.id, duty.cron_schedule, taskCallback, TaskType.DUTY);
    }
};

module.exports = async ({ channel_id, args }) => {
    const [schedule, userString] = args;

    try {
        if (!schedule) {
            postMessage(channel_id, resources.noScheduleError);
            return;
        }

        if (!cronValidator.isValidCron(schedule)) {
            postMessage(channel_id, resources.invalidScheduleError.replace('{schedule}', schedule));
            return;
        }

        if (userString.length === 0) {
            postMessage(channel_id, resources.noUsersError);
            return;
        }

        const dutySchedule = await getDutySchedule(channel_id);
        if (dutySchedule) {
            cancelCronJob(dutySchedule.id, TaskType.DUTY);
            await deleteDutySchedule(channel_id);
            await deleteAllDutyUsers(channel_id);
            await deleteCurrentDuty(channel_id);
        }

        const id = await setDutySchedule(channel_id, schedule);
        const userList = userString.split(',').map(user => user.trim());
        for (let [index, user] of userList.entries()) {
            await addDutyUser(channel_id, user, index + 1);
        }

        let currentDuty = await getCurrentDuty(channel_id);
        if (!currentDuty) {
            await setCurrentDuty(channel_id, userList[0]);
        }

        const taskCallback = createDutyCallback(channel_id);
        setCronJob(id, schedule, taskCallback, TaskType.DUTY);

        postMessage(channel_id, resources.setSuccess);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

module.exports.loadDutyCronJobsFromDb = loadDutyCronJobsFromDb;