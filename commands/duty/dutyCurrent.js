const { getCurrentDuty } = require('../../services/dutyService');
const { postMessage } = require('../../mattermost/utils');
const logger = require('../../logger');

module.exports = async ({ channel_id }) => {
    try {
        const currentDuty = await getCurrentDuty(channel_id);
        postMessage(channel_id, currentDuty);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}