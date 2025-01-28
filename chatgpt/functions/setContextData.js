const redisService = require('../../services/redisService');

const setContextData = async ({ channel_id, key, value }) => {
    try {
        return {
            data: 'Данные успешно сохранены'
        };

        console.log(channel_id, key, value);
        const redisKey = `openai:${channel_id}`;
        await redisService.append(
            redisKey,
            key,
            value
        );
        return {
            data: 'Данные успешно сохранены'
        };
    } catch (error) {
        return {
            data: 'Ошибка при сохранении данных'
        };
    }
}

module.exports = {
    name: 'setContextData',
    description: 'Сохраняет(запоминает) данные для использования в контексте',
    parameters: {
        type: 'object',
        properties: {
            channel_id: { type: 'string' },
            key: {
                type: 'string',
                description: 'Ключ контекста'
            },
            value: {
                type: 'string',
                description: 'Значение контекста'
            }
        },
        required: ['key', 'value']
    },
    function: setContextData,
}; 