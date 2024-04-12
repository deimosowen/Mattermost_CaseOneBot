const { changeNextDuty } = require('../../services/dutyService');
const { postMessage } = require('../../mattermost/utils');
const logger = require('../../logger');

module.exports = async ({ channel_id }) => {
    try {
        const nextDuty = await changeNextDuty(channel_id);
        postMessage(channel_id, nextDuty);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}