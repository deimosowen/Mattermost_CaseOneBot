const { getDutyUsers, getCurrentDuty, setCurrentDuty } = require('../../db/models/duty');
const { postMessage } = require('../../mattermost/utils');
const logger = require('../../logger');
const resources = require('../../resources');

module.exports = async ({ channel_id }) => {
    try {
        let users = await getDutyUsers(channel_id);
        users = users.filter(user => !user.is_disabled);
        if (users.length === 0) {
            postMessage(channel_id, resources.duty.noExistingError);
            return;
        }
        const currentDuty = await getCurrentDuty(channel_id);
        if (!currentDuty) {
            postMessage(channel_id, resources.duty.noExistingError);
            return;
        }
        let nextIndex = (users.findIndex(u => u.user_id === currentDuty.user_id) + 1) % users.length;
        await setCurrentDuty(channel_id, users[nextIndex].user_id);
        postMessage(channel_id, resources.duty.nextNotification.replace('{user}', users[nextIndex].user_id));
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}