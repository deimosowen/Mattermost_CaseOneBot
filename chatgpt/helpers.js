const axios = require('axios');
const OpenAIClientFactory = require('./openAIClientFactory');
const { OPENAI_SESSION_TOKEN } = require('../config');
const logger = require('../logger');

async function generateImages({ prompt }) {
    try {
        const client = OpenAIClientFactory.getClient();
        const params = {
            model: 'dall-e-3',
            prompt: prompt,
            response_format: 'b64_json',
            size: '1024x1024',
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