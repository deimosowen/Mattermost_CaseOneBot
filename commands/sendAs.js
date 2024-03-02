const { postMessage, postMessageInTreed, getChannelById } = require('../mattermost/utils');
const { ADMIN_ID } = require('../config');
const logger = require('../logger');

module.exports = async ({ user_id, args }) => {
    try {
        const [id, message] = args;

        if (ADMIN_ID && (ADMIN_ID !== user_id)) {
            return;
        }

        const channel = await getChannelById(id);
        if (channel) {
            postMessage(id, message);
        } else {
            postMessageInTreed(id, message);
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}