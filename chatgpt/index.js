const OpenAIClientFactory = require('./openAIClientFactory');
const { createService: createDialogHistoryService } = require('./dialogHistoryService');
const redisService = require('../services/redisService');
const { v4: uuidv4 } = require('uuid');
const { functions } = require('./functions');
const logger = require('../logger');
const resources = require('../resources');

async function callFunction(functionCall, additionalParams = {}) {
    const { name, arguments: argsString } = functionCall;
    const args = JSON.parse(argsString);
    const foundFunction = functions.find(func => func.name === name);
    if (!foundFunction) {
        throw new Error('Function not found');
    }
    const finalArgs = { ...args, ...additionalParams };
    return foundFunction.function(finalArgs);
}

async function sendMessage(content, parentMessageId, post, usePersonality = true, imageBase64 = null) {
    const dialogId = parentMessageId || uuidv4();
    try {
        const client = OpenAIClientFactory.getClient();
        const model = OpenAIClientFactory.getModel();

        const dialogHistory = createDialogHistoryService(dialogId);

        if (!parentMessageId) {
            if (usePersonality) {
                const systemMessage = { role: 'system', content: resources.question.personality };
                dialogHistory.addMessage(systemMessage);
            }

            const contextParams = await redisService.get(`openai:globalContext`);
            if (contextParams.context && typeof contextParams.context === 'object') {
                const contextString = Object.entries(contextParams.context)
                    .map(([key, value]) => `${key}: ${value}`)
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

        const params = {
            model: model ?? 'gpt-4-turbo-preview',
            messages: history,
            functions: functions
        };

        let completion = await client.chat.completions.create(params);
        let message = completion.choices[0]?.message;
        let fileId;
        let assistantMessage;
        if (message.function_call) {
            const additionalParams = { channel_id: post.channel_id, post_id: post.id, user_id: post.user_id };
            const result = await callFunction(message.function_call, additionalParams);
            const functionResultMessage = {
                role: 'function',
                name: message.function_call.name,
                content: result.data,
            };
            dialogHistory.addMessage(functionResultMessage);
            completion = await client.chat.completions.create(params);
            logger.info(`usage: ${JSON.stringify(completion.usage)}`);

            message = completion.choices[0]?.message;
            fileId = result?.fileId;
        }

        assistantMessage = {
            role: 'assistant',
            content: message?.content || ''
        };
        dialogHistory.addMessage(assistantMessage);

        return {
            id: dialogId,
            text: assistantMessage.content,
            fileId: fileId,
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        return {
            id: dialogId,
            text: 'Что-то пошло не так.'
        }
    }
}

module.exports = {
    sendMessage,
    isApiKeyExist: OpenAIClientFactory.isApiKeyExist()
};
