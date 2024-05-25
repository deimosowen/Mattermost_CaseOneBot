const OpenAIClientFactory = require('./openAIClientFactory');
const logger = require('../logger');
const { OPENAI_API_KEY, OPENAI_API_MODEL } = require('../config');

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

module.exports = {
    generateImages,
};