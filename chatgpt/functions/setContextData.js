const redisService = require('../../services/redisService');

const setContextData = async ({ key, value }) => {
    try {
        const redisKey = `openai:globalContext`;
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