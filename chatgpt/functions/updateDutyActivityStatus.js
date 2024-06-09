const dutyService = require('../../services/dutyService');

const updateDutyActivityStatus = async ({ channel_id, username, isDisabled, returnDate }) => {
    const result = await dutyService.updateDutyActivityStatus(channel_id, username, isDisabled, returnDate);
    return {
        data: result,
    };
}

module.exports = {
    name: 'updateDutyActivityStatus',
    description: 'Меняет активность (отсутствие, отпуск) для конкретного дежурного и списке. Позволяет устанавливать дату возвращения',
    parameters: {
        type: 'object',
        properties: {
            channel_id: { type: 'string' },
            username: { type: 'string', description: 'Имя пользователя, начиная с @' },
            isDisabled: { type: 'boolean', description: 'Статус активности дежурного (активен или неактивен).' },
            returnDate: { type: 'string', description: 'Дата (формат YYYY-MM-DD) возвращения пользователя к дежурству. "null" если не указан явно' },
        },
    },
    function: updateDutyActivityStatus,
};