const { postMessageInTreed } = require('../../mattermost/utils');
const { getForwardMessageByMessageId } = require('../../db/models/forward');

module.exports = async function handleForwardDeletion(post) {
    const forwardMessage = await getForwardMessageByMessageId(post.id);
    if (!forwardMessage) return;

    const message = `
Обращение было удалено.
Оригинальное сообщение:
\`\`\`
${post.message}
\`\`\``;

    await postMessageInTreed(
        forwardMessage.send_message_id,
        message
    );
};