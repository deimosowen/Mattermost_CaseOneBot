const { postMessage } = require('../mattermost/utils');
const { ADMIN_ID } = require('../config');
const logger = require('../logger');

module.exports = async ({ user_id, args }) => {
    try {
        const [channel_id, message] = args;

        if (ADMIN_ID && (ADMIN_ID !== user_id)) {
            return;
        }

        postMessage(channel_id, message);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}
