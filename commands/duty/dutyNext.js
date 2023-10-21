const { getDutyUsers, getCurrentDuty, setCurrentDuty } = require('../../db/models/duty');
const { postMessage } = require('../../mattermost/utils');
const logger = require('../../logger');
const resources = require('../../resources.json').duty;

module.exports = async ({ channel_id }) => {
    try {
        const users = await getDutyUsers(channel_id);
        const currentDuty = await getCurrentDuty(channel_id);
        if (!currentDuty) {
            postMessage(channel_id, resources.noExistingError);
            return;
        }

        let nextIndex = (users.findIndex(u => u.user_id === currentDuty.user_id) + 1) % users.length;
        await setCurrentDuty(channel_id, users[nextIndex].user_id);
        postMessage(channel_id, resources.nextNotification.replace('{user}', users[nextIndex].user_id));
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}