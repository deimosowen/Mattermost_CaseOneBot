const { postMessage } = require('../../mattermost/utils');
const { addChannelMapping } = require('../../db/models/forward');
const logger = require('../../logger');
const resources = require('../../resources.json').forward;

module.exports = async ({ channel_id, args }) => {
    try {
        const [sourceChannelId, targetChannelId, message, threadMessage] = args;

        await addChannelMapping(sourceChannelId, targetChannelId, message || null, threadMessage || null);

        postMessage(channel_id, resources.mappingSetupSuccess);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        postMessage(channel_id, resources.forwardCommandError);
    }
};
