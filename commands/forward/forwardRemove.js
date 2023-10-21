const { postMessage } = require('../../mattermost/utils');
const { getChannelMapping, deleteChannelMapping } = require('../../db/models/forward');
const logger = require('../../logger');
const resources = require('../../resources.json').forward;

module.exports = async ({ channel_id, args }) => {
    try {
        const [mappingId] = args;
        if (!mappingId) {
            postMessage(channel_id, resources.noMappingId);
            return;
        }
        const mp = await getChannelMapping(mappingId);
        if (!mp) {
            postMessage(channel_id, resources.mappingNotFound.replace('{mappingId}', mappingId));
            return;
        }
        await deleteChannelMapping(mappingId);
        postMessage(channel_id, resources.mappingRemoved.replace('{mappingId}', mappingId));

    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        postMessage(channel_id, resources.errorRemovingMapping);
    }
};