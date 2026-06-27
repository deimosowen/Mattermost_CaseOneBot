const OpenAI = require('openai');
const { OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_API_MODEL } = require('../config');

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

function normalizeBaseURL(baseURL) {
    const normalized = (baseURL || '').trim().replace(/\/+$/, '');
    if (!normalized) {
        return undefined;
    }

    if (normalized === 'https://api.openai.com/v2') {
        throw new Error(`OPENAI_BASE_URL=${normalized} is not supported by the official OpenAI API. Use ${DEFAULT_OPENAI_BASE_URL}, or set the custom provider base URL if this key belongs to a proxy.`);
    }

    return normalized;
}

class OpenAIClientFactory {
    static client = null;
    static apiKey = OPENAI_API_KEY;
    static defaultModel = OPENAI_API_MODEL ?? 'gpt-4-turbo-preview';

    static createClient(baseURL, apiKey) {
        return new OpenAI({
            baseURL: normalizeBaseURL(baseURL),
            apiKey: apiKey
        });
    }

    static getClient() {
        if (!OPENAI_API_KEY) {
            throw new Error('OpenAI API key is not provided.');
        }

        if (!this.client) {
            this.client = new OpenAI({
                baseURL: normalizeBaseURL(OPENAI_BASE_URL),
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
module.exports.normalizeBaseURL = normalizeBaseURL;
