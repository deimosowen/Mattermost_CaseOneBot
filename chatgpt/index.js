const logger = require('../logger');
const { OPENAI_API_KEY } = require('../config');

let api = null;

async function initializeChatGPTAPI() {
    if (!api) {
        try {
            const ChatGPTAPI = (await import('chatgpt')).ChatGPTAPI;
            api = new ChatGPTAPI({ apiKey: OPENAI_API_KEY });
        } catch (error) {
            logger.error(`${error.message}\nStack trace:\n${error.stack}`);
            throw error;
        }
    }
    return api;
}

async function sendMessage(message, parentMessageId) {
    try {
        const api = await initializeChatGPTAPI();
        const response = await api.sendMessage(message, { parentMessageId: parentMessageId });
        return response;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        throw error;
    }
}

module.exports = {
    sendMessage
};
