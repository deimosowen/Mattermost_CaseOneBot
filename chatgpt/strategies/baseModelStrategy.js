const { functions } = require('../functions');

class BaseModelStrategy {
    async createChatCompletion(client, params) {
        throw new Error('Must be implemented');
    }

    async handleFunctionCall(message, additionalParams) {
        throw new Error('Must be implemented');
    }

    prepareParams(messages, functions) {
        throw new Error('Must be implemented');
    }

    createFunctionResultMessage(name, content, additionalParams) {
        throw new Error('Must be implemented');
    }

    createAssistantMessage(message) {
        return {
            role: 'assistant',
            content: message?.content || ''
        };
    }

    async callFunction(functionCall, additionalParams = {}) {
        const { name, arguments: argsString } = functionCall;
        const args = JSON.parse(argsString);
        const foundFunction = functions.find(func => func.name === name);
        if (!foundFunction) {
            throw new Error('Function not found');
        }
        const finalArgs = { ...args, ...additionalParams };
        return foundFunction.function(finalArgs);
    }
}

module.exports = BaseModelStrategy;