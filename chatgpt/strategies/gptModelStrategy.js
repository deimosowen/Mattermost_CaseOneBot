const BaseModelStrategy = require('./baseModelStrategy');

class GPTModelStrategy extends BaseModelStrategy {
    async createChatCompletion(client, params) {
        return await client.chat.completions.create(params);
    }

    async handleFunctionCall(message, additionalParams) {
        if (!message.function_call) {
            return null;
        }

        const messages = [];

        messages.push(this.createAssistantMessage({
            content: message.content,
            name: message.function_call.name
        }));

        const result = await this.callFunction(message.function_call, additionalParams);

        messages.push(this.createFunctionResultMessage({
            ...result,
            name: message.function_call.name
        }));

        return messages;
    }

    prepareParams(messages, functions) {
        return {
            messages,
            functions
        };
    }

    createFunctionResultMessage(functionResult) {
        return {
            role: 'function',
            name: functionResult.name,
            content: functionResult.data
        };
    }

    createAssistantMessage(message) {
        const assistantMessage = {
            role: 'assistant',
            content: message?.content || ''
        };

        if (message?.name) {
            assistantMessage.name = message.name;
        }

        return assistantMessage;
    }
}

module.exports = GPTModelStrategy;