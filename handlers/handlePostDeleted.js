const { deletePost } = require('../mattermost/utils');
const { getForwardMessageByMessageId } = require('../db/models/forward');
const logger = require('../logger');

module.exports = async (post, eventData) => {
    try {
        const forwardMessage = await getForwardMessageByMessageId(post.id);
        if (forwardMessage) {
            await deletePost(forwardMessage.send_message_id);
        }
    } catch (err) {
        logger.error(err);
    }
};