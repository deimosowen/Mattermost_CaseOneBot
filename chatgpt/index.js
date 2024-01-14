const logger = require('../logger');
const { OPENAI_API_KEY, OPENAI_API_MODEL } = require('../config');

let api = null;

async function initializeChatGPTAPI() {
    if (!api) {
        try {
            const ChatGPTAPI = (await import('chatgpt')).ChatGPTAPI;
            api = new ChatGPTAPI({
                apiKey: OPENAI_API_KEY,
                completionParams: {
                    model: OPENAI_API_MODEL ?? 'gpt-3.5-turbo'
                }
            });
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

const isApiKeyExist = {
    get value() {
        return !!OPENAI_API_KEY;
    }
};

module.exports = {
    sendMessage,
    isApiKeyExist: isApiKeyExist.value
};
