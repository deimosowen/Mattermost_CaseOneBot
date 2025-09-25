const cronValidator = require('cron-validator');
const { setDutySchedule, addDutyUser, getDutySchedule, setCurrentDuty,
    getCurrentDuty, deleteDutySchedule, deleteAllDutyUsers, deleteCurrentDuty } = require('../../db/models/duty');
const cronManager = require('../../cron/cronManager');
const CronServiceTypes = require('../../cron/сronServiceTypes');
const { postMessage } = require('../../mattermost/utils');
const logger = require('../../logger');
const resources = require('../../resources');

module.exports = async ({ channel_id, args }) => {
    const [schedule, userString] = args;

    try {
        if (!schedule) {
            postMessage(channel_id, resources.duty.noScheduleError);
            return;
        }

        if (!cronValidator.isValidCron(schedule)) {
            postMessage(channel_id, resources.duty.invalidScheduleError.replace('{schedule}', schedule));
            return;
        }

        if (userString.length === 0) {
            postMessage(channel_id, resources.duty.noUsersError);
            return;
        }

        const dutyService = cronManager.get(CronServiceTypes.DUTY);

        const dutySchedule = await getDutySchedule(channel_id);
        if (dutySchedule) {
            dutyService.removeJob(dutySchedule.id);
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

        dutyService.addJob({ id, schedule, channel_id });

        postMessage(channel_id, resources.duty.setSuccess);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};