const OpenAIClientFactory = require('./openAIClientFactory');
const { v4: uuidv4 } = require('uuid');
const { functions } = require('./functions');
const logger = require('../logger');
const resources = require('../resources');
const { OPENAI_API_KEY, OPENAI_API_MODEL } = require('../config');

const messageHistory = {};

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

async function sendMessage(content, parentMessageId, channel_id, usePersonality = true) {
    try {
        const client = OpenAIClientFactory.getClient();

        const dialogId = parentMessageId || uuidv4();

        if (!messageHistory[dialogId]) {
            messageHistory[dialogId] = [];
        }

        if (!parentMessageId && usePersonality) {
            const systemMessage = { role: 'system', content: resources.question.personality };
            messageHistory[dialogId].push(systemMessage);
        }

        const userMessage = { role: 'user', content: content };

        messageHistory[dialogId].push(userMessage);

        const params = {
            model: OPENAI_API_MODEL ?? 'gpt-4-turbo-preview',
            messages: messageHistory[dialogId],
            functions: functions
        };

        let completion = await client.chat.completions.create(params);
        let message = completion.choices[0]?.message;
        let assistantMessage;
        let fileId;
        if (message.function_call) {
            const additionalParams = { channel_id };
            const result = await callFunction(message.function_call, additionalParams);

            const functionResultMessage = {
                role: 'function',
                name: message.function_call.name,
                content: `${JSON.stringify(result.data)}`,
            };
            messageHistory[dialogId].push(functionResultMessage);
            completion = await client.chat.completions.create(params);
            message = completion.choices[0]?.message;
            fileId = result?.fileId;
        }

        assistantMessage = {
            role: 'assistant',
            content: message?.content
        };
        messageHistory[dialogId].push(assistantMessage);

        return {
            id: dialogId,
            text: assistantMessage.content,
            fileId: fileId,
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
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
