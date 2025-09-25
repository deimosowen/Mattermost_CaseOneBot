const axios = require('axios');
const OpenAIClientFactory = require('./openAIClientFactory');
const { OPENAI_SESSION_TOKEN, OPENAI_DALLE_API_KEY } = require('../config');
const logger = require('../logger');

async function generateImages({ prompt }) {
    try {
        const client = OpenAIClientFactory.createClient('https://api.openai.com/v1', OPENAI_DALLE_API_KEY);
        const params = {
            model: 'dall-e-3',
            prompt: prompt,
            response_format: 'b64_json',
            size: '1792x1024',
        };
        const completion = await client.images.generate(params);
        return completion.data[0];
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}

async function checkCredits() {
    try {
        const response = await axios({
            method: 'GET',
            url: 'https://api.openai.com/dashboard/billing/credit_grants',
            headers: {
                'Authorization': `Bearer ${OPENAI_SESSION_TOKEN}`
            }
        });
        return response.data;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}

module.exports = {
    generateImages,
    checkCredits,
};