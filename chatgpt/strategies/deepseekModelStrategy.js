const BaseModelStrategy = require('./baseModelStrategy');

class DeepseekModelStrategy extends BaseModelStrategy {
    async createChatCompletion(client, params) {
        return await client.chat.completions.create(params);
    }

    async handleFunctionCall(message, additionalParams) {
        if (!message.tool_calls) {
            return null;
        }

        const messages = [];

        for (const toolCall of message.tool_calls) {
            messages.push(this.createAssistantMessage({
                content: message.content,
                tool_calls: [toolCall]
            }));

            const result = await this.callFunction({
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
            }, additionalParams);

            messages.push(this.createFunctionResultMessage({
                ...result,
                tool_call_id: toolCall.id,
                name: toolCall.function.name
            }));
        }

        messages.push(this.createAssistantMessage({
            content: 'Functions completed'
        }));

        return messages;
    }

    prepareParams(messages, functions) {
        return {
            messages,
            tools: functions.map(f => ({
                type: 'function',
                function: f
            }))
        };
    }

    createFunctionResultMessage(functionResult) {
        return {
            role: 'tool',
            tool_call_id: functionResult.tool_call_id,
            content: functionResult.data
        };
    }

    createAssistantMessage(message) {
        const assistantMessage = {
            role: 'assistant',
            content: message?.content || ''
        };

        if (message?.tool_calls) {
            assistantMessage.tool_calls = message.tool_calls;
        }

        return assistantMessage;
    }

    createSystemMessage(message) {
        return {
            role: 'system',
            content: message
        };
    }
}

module.exports = DeepseekModelStrategy;