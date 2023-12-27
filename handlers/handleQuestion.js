const { getMe, postMessageInTreed, userTyping } = require('../mattermost/utils');
const { sendMessage } = require('../chatgpt');
const { getChatIdForPost, setChatIdForPost } = require('../chatgpt/chatMap');
const logger = require('../logger');
const resources = require('../resources');
const { OPENAI_API_KEY } = require('../config');

module.exports = async (post, eventData) => {
    if (!OPENAI_API_KEY) {
        logger.error('OpenAI API key is not set.');
        return;
    }

    let typingInterval;
    try {
        const bot = await getMe();
        const botName = `@${bot.username}`;

        if (!post.message.startsWith(botName)) {
            return;
        }

        const question = post.message.replace(botName, '').trimStart();
        if (question === '') {
            logger.error('Empty question received.');
            return;
        }

        userTyping(post.id);
        typingInterval = setInterval(() => userTyping(post.id), 4000);

        const postId = post.root_id || post.id;
        const chatId = getChatIdForPost(postId);
        const message = chatId ? question : resources.question.prompt.replace('{question}', question);

        const res = await sendMessage(message, chatId);

        setChatIdForPost(postId, res.id);

        postMessageInTreed(post.id, res.text);
    } catch (error) {
        logger.error(`Error: ${error.message}\nStack trace:\n${error.stack}`);
    } finally {
        if (typingInterval) {
            clearInterval(typingInterval)
        };
    }
}
