const { postMessageInTreed } = require('../mattermost/utils');
const { getForwardMessageByMessageId } = require('../db/models/forward');
const logger = require('../logger');

module.exports = async (post, eventData) => {
    try {
        const forwardMessage = await getForwardMessageByMessageId(post.id);
        if (forwardMessage) {
            const message = `
Обращение было удалено.
Оригинальное сообщение:
\`\`\`
${post.message}
\`\`\``;
            await postMessageInTreed(post.id, message);
        }
    } catch (err) {
        logger.error(err);
    }
};