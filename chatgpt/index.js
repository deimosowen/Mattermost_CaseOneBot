const OpenAIClientFactory = require('./openAIClientFactory');
const { createService: createDialogHistoryService } = require('./dialogHistoryService');
const redisService = require('../services/redisService');
const { v4: uuidv4 } = require('uuid');
const { functions } = require('./functions');
const { buildTools } = require('./toolDefinitions');
const { splitHistoryForResponseApi } = require('./inputAdapter');
const { selectFunctions, selectToolGroups } = require('./toolSelector');
const { OPENAI_API_TEMPERATURE, OPENAI_API_TOP_P } = require('../config');
const logger = require('../logger');
const resources = require('../resources');

const MAX_FUNCTION_CALL_STEPS = 10;

function stringifyToolOutput(result) {
    const output = result?.data ?? result ?? '';

    if (typeof output === 'string') {
        return output;
    }

    return JSON.stringify(output);
}

async function callFunction(functionCall, additionalParams = {}) {
    const { name, arguments: argsRaw } = functionCall;
    const args = typeof argsRaw === 'string'
        ? JSON.parse(argsRaw || '{}')
        : (argsRaw || {});

    const foundFunction = functions.find((func) => func.name === name);
    if (!foundFunction) {
        throw new Error(`Function not found: ${name}`);
    }

    const finalArgs = { ...args, ...additionalParams };
    return foundFunction.function(finalArgs);
}

function buildRequestOptions(model, history, tools) {
    const { instructions, input } = splitHistoryForResponseApi(history);
    const options = {
        model: model ?? 'gpt-5-mini',
        input,
        store: false,
    };

    if (tools.length > 0) {
        options.tools = tools;
        options.tool_choice = 'auto';
    }

    if (instructions) {
        options.instructions = instructions;
    }

    if (OPENAI_API_TEMPERATURE !== undefined && OPENAI_API_TEMPERATURE !== '') {
        options.temperature = Number(OPENAI_API_TEMPERATURE);
    }

    if (OPENAI_API_TOP_P !== undefined && OPENAI_API_TOP_P !== '') {
        options.top_p = Number(OPENAI_API_TOP_P);
    }

    return options;
}

async function runWithFunctionCalling(client, requestOptions, additionalParams) {
    let input = requestOptions.input;
    let response = await client.responses.create({
        ...requestOptions,
        input,
    });
    let fileId;

    for (let step = 0; step < MAX_FUNCTION_CALL_STEPS; step++) {
        const responseOutput = response.output || [];
        const functionCalls = responseOutput.filter((item) => item.type === 'function_call');
        if (functionCalls.length === 0) {
            break;
        }

        const toolOutputs = [];
        for (const call of functionCalls) {
            const result = await callFunction(call, additionalParams);
            toolOutputs.push({
                type: 'function_call_output',
                call_id: call.call_id,
                output: stringifyToolOutput(result),
            });

            if (result?.fileId) {
                fileId = result.fileId;
            }
        }

        input = [
            ...input,
            ...responseOutput,
            ...toolOutputs,
        ];

        response = await client.responses.create({
            ...requestOptions,
            input,
        });

        if (response.usage) {
            logger.info(`usage: ${JSON.stringify(response.usage)}`);
        }
    }

    return { response, fileId };
}

async function sendMessage(content, parentMessageId, post, usePersonality = true, imageBase64 = null, options = {}) {
    const dialogId = parentMessageId || uuidv4();
    const selectionText = options.selectionText ?? content;

    try {
        const client = OpenAIClientFactory.getClient();
        const model = OpenAIClientFactory.getModel();
        const dialogHistory = createDialogHistoryService(dialogId);
        const hasPost = Boolean(post);

        if (!parentMessageId) {
            if (usePersonality) {
                dialogHistory.addMessage({
                    role: 'system',
                    content: resources.question.personality,
                });
            }

            const contextParams = await redisService.get(`openai:globalContext`);
            if (contextParams?.context && typeof contextParams.context === 'object') {
                const contextString = Object.entries(contextParams.context)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n');

                dialogHistory.addMessage({
                    role: 'system',
                    content: contextString,
                });
            }
        }

        if (imageBase64) {
            dialogHistory.addMessage({
                role: 'user',
                content: [
                    { type: 'text', text: content },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${imageBase64}`,
                        },
                    },
                ],
            });
        } else {
            dialogHistory.addMessage({
                role: 'user',
                content: content,
            });
        }

        const history = dialogHistory.getHistory();
        const selectionOptions = {
            history,
            selectionText,
            hasPost,
            hasImage: Boolean(imageBase64),
        };
        const selection = selectToolGroups(selectionOptions);
        const selectedFunctions = selectFunctions(functions, selectionOptions);
        const tools = buildTools(selectedFunctions);

        logger.info(`tool groups: ${selection.groups.join(', ')} (${selectedFunctions.length} tools)`);

        const requestOptions = buildRequestOptions(model, history, tools);
        const additionalParams = post
            ? { channel_id: post.channel_id, post_id: post.id, user_id: post.user_id }
            : {};

        const { response, fileId } = await runWithFunctionCalling(client, requestOptions, additionalParams);
        const assistantText = response.output_text || '';

        dialogHistory.addMessage({
            role: 'assistant',
            content: assistantText,
        });

        return {
            id: dialogId,
            text: assistantText,
            fileId,
        };
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        return {
            id: dialogId,
            text: 'Что-то пошло не так.',
        };
    }
}

module.exports = {
    sendMessage,
    isApiKeyExist: OpenAIClientFactory.isApiKeyExist(),
};
