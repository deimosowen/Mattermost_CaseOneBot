const { postMessage } = require('../../mattermost/utils');
const { addChannelMapping } = require('../../db/models/forward');
const logger = require('../../logger');
const resources = require('../../resources');

module.exports = async ({ channel_id, args }) => {
    try {
        const [sourceChannelId, targetChannelId, message, threadMessage] = args;

        await addChannelMapping(sourceChannelId, targetChannelId, message || null, threadMessage || null);

        postMessage(channel_id, resources.forward.mappingSetupSuccess);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        postMessage(channel_id, resources.forward.forwardCommandError);
    }
};
