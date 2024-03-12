const { postMessageInTreed } = require('../../mattermost/utils');
const { addChannelMapping } = require('../../db/models/forward');
const logger = require('../../logger');
const resources = require('../../resources');

module.exports = async ({ post_id, args }) => {
    try {
        const [sourceChannelId, targetChannelId, message, threadMessage] = args;

        await addChannelMapping(sourceChannelId, targetChannelId, message || null, threadMessage || null);

        postMessageInTreed(post_id, resources.forward.mappingSetupSuccess);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        postMessageInTreed(post_id, resources.forward.forwardCommandError);
    }
};