const { getUser, getMe, postMessageInTreed, userTyping, downloadFile } = require('../mattermost/utils');
const { sendMessage, isApiKeyExist } = require('../chatgpt');
const { getChatIdForPost, setChatIdForPost } = require('../chatgpt/chatMap');
const logger = require('../logger');
const resources = require('../resources');

module.exports = async (post, eventData) => {
    if (!isApiKeyExist) {
        logger.info('OpenAI API key is not set.');
        return;
    }

    let typingInterval;
    try {
        const bot = await getMe();
        const botName = `@${bot.username}`;
        const isPrivateChannel = eventData.channel_type === 'D';

        if (!post.message.startsWith(botName) && !isPrivateChannel || eventData.sender_name === botName) {
            return;
        }

        const question = post.message.replace(botName, '').trimStart();
        if (question === '') {
            logger.error('Empty question received.');
            return;
        }

        userTyping(post.id);
        typingInterval = setInterval(() => userTyping(post.id), 4000);

        const usePersonality = !isPrivateChannel;
        const postId = post.root_id || post.id;
        const chatId = getChatIdForPost(postId);
        const user = await getUser(post.user_id);
        const message = prapareMessage(question, user);
        const fileIds = post.file_ids ?? [];
        const imageBase64 = fileIds.length > 0 ? await downloadFile(fileIds[0]) : null;
        const res = await sendMessage(message, chatId, post, usePersonality, imageBase64);

        logger.info(message);

        setChatIdForPost(postId, res.id);
        postMessageInTreed(post.id, res.text, [res.fileId]);
    } catch (error) {
        logger.error(`Error: ${error.message}\nStack trace:\n${error.stack}`);
    } finally {
        if (typingInterval) {
            clearInterval(typingInterval)
        };
    }
}

function prapareMessage(question, user) {
    return resources.question.prompt
        .replace('{question}', question)
        .replace('{username}', `@${user.username}(${user.first_name} ${user.last_name})`);
}