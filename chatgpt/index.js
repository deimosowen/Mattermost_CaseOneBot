const OpenAIClientFactory = require('./openAIClientFactory');
const { ModelStrategyFactory } = require('./strategies');
const { createService: createDialogHistoryService } = require('./dialogHistoryService');
const redisService = require('../services/redisService');
const { v4: uuidv4 } = require('uuid');
const { functions } = require('./functions');
const logger = require('../logger');
const resources = require('../resources');

async function sendMessage(content, parentMessageId, post, usePersonality = true, imageBase64 = null) {
    const dialogId = parentMessageId || uuidv4();
    try {
        const client = OpenAIClientFactory.getClient();
        const model = OpenAIClientFactory.getModel();
        const strategy = ModelStrategyFactory.createStrategy(model);

        const dialogHistory = createDialogHistoryService(dialogId);

        if (!parentMessageId) {
            if (usePersonality) {
                const systemMessage = { role: 'system', content: resources.question.personality };
                dialogHistory.addMessage(systemMessage);
            }

            const contextParams = await redisService.get(`openai:${post?.channel_id}`);
            if (contextParams.context && contextParams.context.length > 0) {
                const contextString = contextParams.context
                    .map(item => {
                        const [key, value] = Object.entries(item)[0];
                        return `${key}: ${value}`;
                    })
                    .join('\n');

                const contextMessage = {
                    role: 'system',
                    content: contextString
                };
                dialogHistory.addMessage(contextMessage);
            }
        }

        let userMessage;

        if (imageBase64) {
            userMessage = {
                role: 'user',
                content: [{
                    type: 'text',
                    text: content
                },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBase64}`
                    }
                }]
            };
        } else {
            userMessage = {
                role: 'user',
                content: content
            };
        }
        dialogHistory.addMessage(userMessage);

        const history = dialogHistory.getHistory();
        const baseParams = strategy.prepareParams(history, functions);
        const params = {
            model,
            ...baseParams
        };

        let completion = await strategy.createChatCompletion(client, params);
        let message = completion.choices[0]?.message;
        let fileId;

        const functionsResult = await strategy.handleFunctionCall(message, {
            channel_id: post?.channel_id,
            post_id: post?.id,
            user_id: post?.user_id
        });

        if (functionsResult) {
            for (const message of functionsResult) {
                dialogHistory.addMessage(message);
            }

            dialogHistory.addMessage({
                role: 'user',
                content: 'Расскажи мне результат.'
            });

            completion = await strategy.createChatCompletion(client, params);

            message = completion.choices[0]?.message;
            fileId = functionsResult?.fileId;
        }

        dialogHistory.addMessage({
            role: 'assistant',
            content: message?.content // || functionResult.data
        });

        return {
            id: dialogId,
            text: message?.content, // || functionResult.data,
            fileId: fileId,
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        return {
            id: dialogId
        }
    }
}

module.exports = {
    sendMessage,
    isApiKeyExist: OpenAIClientFactory.isApiKeyExist()
};
