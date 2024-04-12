const OpenAI = require('openai');
const { OPENAI_API_KEY } = require('../config');

class OpenAIClientFactory {
    static client = null;

    static getClient() {
        if (!OPENAI_API_KEY) {
            throw new Error('OpenAI API key is not provided.');
        }

        if (!this.client) {
            this.client = new OpenAI({
                apiKey: OPENAI_API_KEY
            });
        }

        return this.client;
    }
}

module.exports = OpenAIClientFactory;