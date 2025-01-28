const OpenAI = require('openai');
const { OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_API_MODEL } = require('../config');

class OpenAIClientFactory {
    static client = null;
    static apiKey = OPENAI_API_KEY;
    static defaultModel = OPENAI_API_MODEL ?? 'gpt-4-turbo-preview';

    static createClient(baseURL, apiKey) {
        return new OpenAI({
            baseURL: baseURL,
            apiKey: apiKey
        });
    }

    static getClient() {
        if (!OPENAI_API_KEY) {
            throw new Error('OpenAI API key is not provided.');
        }

        if (!this.client) {
            this.client = new OpenAI({
                baseURL: OPENAI_BASE_URL,
                apiKey: OPENAI_API_KEY
            });
        }

        return this.client;
    }

    static getModel() {
        return this.defaultModel;
    }

    static isApiKeyExist() {
        return !!this.apiKey;
    }
}

module.exports = OpenAIClientFactory;