function convertContentPart(part) {
    if (part.type === 'text') {
        return { type: 'input_text', text: part.text };
    }

    if (part.type === 'image_url') {
        const imageUrl = typeof part.image_url === 'string'
            ? part.image_url
            : part.image_url?.url;

        return { type: 'input_image', image_url: imageUrl };
    }

    if (part.type === 'input_text' || part.type === 'input_image') {
        return part;
    }

    return part;
}

function convertMessage(message) {
    if (message.role === 'user' && Array.isArray(message.content)) {
        return {
            role: 'user',
            content: message.content.map(convertContentPart),
        };
    }

    return message;
}

/**
 * Разделяет историю диалога на instructions (system) и input для Responses API.
 */
function splitHistoryForResponseApi(history) {
    const systemParts = [];
    const input = [];

    for (const message of history) {
        if (message.role === 'system') {
            systemParts.push(message.content);
            continue;
        }

        // Legacy function-результаты без call_id не воспроизводим в Responses API.
        if (message.role === 'function') {
            continue;
        }

        input.push(convertMessage(message));
    }

    return {
        instructions: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
        input,
    };
}

module.exports = {
    splitHistoryForResponseApi,
};
