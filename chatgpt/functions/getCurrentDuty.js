const dutyService = require('../../services/dutyService');

const getCurrentDuty = async ({ channel_id }) => {
    const result = await dutyService.getCurrentDuty(channel_id);
    return {
        data: result,
    };
}

module.exports = {
    name: 'getCurrentDuty',
    description: 'Возвращает текущего дежурного',
    parameters: {
        type: 'object',
        properties: {
            channel_id: { type: 'string' },
        },
    },
    function: getCurrentDuty,
};