const logger = require('../logger');
const { OPENAI_API_KEY, OPENAI_API_MODEL, OPENAI_API_TEMPERATURE, OPENAI_API_TOP_P } = require('../config');

let api = null;

async function initializeChatGPTAPI() {
    if (!api) {
        try {
            const ChatGPTAPI = (await import('chatgpt')).ChatGPTAPI;
            api = new ChatGPTAPI({
                apiKey: OPENAI_API_KEY,
                completionParams: {
                    model: OPENAI_API_MODEL ?? 'gpt-4-turbo-preview',
                    temperature: OPENAI_API_TEMPERATURE ?? null,
                    top_p: OPENAI_API_TOP_P ?? null
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
