const { getCurrentDuty } = require('../../db/models/duty');
const { postMessage } = require('../../mattermost/utils');
const logger = require('../../logger');
const resources = require('../../resources.json').duty;

module.exports = async ({ channel_id }) => {
    try {
        const currentDuty = await getCurrentDuty(channel_id);
        if (!currentDuty) {
            postMessage(channel_id, resources.noCurrent);
            return;
        }
        postMessage(channel_id, resources.currentNotification.replace('{user}', currentDuty.user_id));
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}