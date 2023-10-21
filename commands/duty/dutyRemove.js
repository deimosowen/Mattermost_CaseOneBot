const { getDutySchedule, deleteDutySchedule, deleteAllDutyUsers, deleteCurrentDuty } = require('../../db/models/duty');
const { cancelCronJob } = require('../../cron');
const { postMessage } = require('../../mattermost/utils');
const TaskType = require('../../types/taskTypes');
const resources = require('../../resources.json').duty;

module.exports = async ({ channel_id }) => {
    try {
        const dutySchedule = await getDutySchedule(channel_id);
        if (!dutySchedule) {
            postMessage(channel_id, resources.notSet);
            return;
        }

        cancelCronJob(dutySchedule.id, TaskType.DUTY);
        await deleteDutySchedule(channel_id);
        await deleteAllDutyUsers(channel_id);
        await deleteCurrentDuty(channel_id);

        postMessage(channel_id, resources.removed);
    } catch (e) {
        console.log(e);
    }
}