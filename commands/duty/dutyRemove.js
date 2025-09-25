const { getDutySchedule, deleteDutySchedule, deleteAllDutyUsers, deleteCurrentDuty } = require('../../db/models/duty');
const cronManager = require('../../cron/cronManager');
const CronServiceTypes = require('../../cron/сronServiceTypes');
const { postMessage } = require('../../mattermost/utils');
const logger = require('../../logger');
const resources = require('../../resources');

module.exports = async ({ channel_id }) => {
    try {
        const dutySchedule = await getDutySchedule(channel_id);
        if (!dutySchedule) {
            postMessage(channel_id, resources.duty.notSet);
            return;
        }
        const dutyService = cronManager.get(CronServiceTypes.DUTY);
        dutyService.removeJob(id);

        await deleteDutySchedule(channel_id);
        await deleteAllDutyUsers(channel_id);
        await deleteCurrentDuty(channel_id);

        postMessage(channel_id, resources.duty.removed);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}