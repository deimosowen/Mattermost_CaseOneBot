const { getCurrentDuty, changeNextDuty, updateDutyActivityStatus } = require('../services/dutyService');

const functions = [
    {
        name: 'getCurrentDuty',
        description: 'Возвращает текущего дежурного',
        parameters: {
            type: 'object',
            properties: {
                channel_id: { type: 'string' },
            },
        },
        function: getCurrentDuty,
    },
    {
        name: 'changeNextDuty',
        description: 'Меняет текущего дежурного на следующего по списку',
        parameters: {
            type: 'object',
            properties: {
                channel_id: { type: 'string' },
            },
        },
        function: changeNextDuty,
    },
    {
        name: 'updateDutyActivityStatus',
        description: 'Меняет активность (отсутствие, отпуск) для конкретного дежурного и списке',
        parameters: {
            type: 'object',
            properties: {
                channel_id: { type: 'string' },
                username: { type: 'string', description: 'Имя пользователя, начиная с @' },
                isDisabled: { type: 'boolean', description: 'Статус пользователя, активен/неактивен' },
                returnDate: { type: 'string', description: 'Дата (формат YYYY-MM-DD) возвращения пользователя к дежурству. "null" если не указан явно' },
            },
        },
        function: updateDutyActivityStatus,
    }
];

module.exports = {
    functions,
};
