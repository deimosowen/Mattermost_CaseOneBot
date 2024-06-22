const dutyService = require('../../services/dutyService');

const changeNextDuty = async ({ channel_id }) => {
    const result = await dutyService.changeNextDuty(channel_id);
    return {
        data: result,
    };
}

module.exports = {
    name: 'changeNextDuty',
    description: 'Меняет текущего дежурного на следующего по списку',
    parameters: {
        type: 'object',
        properties: {
            channel_id: { type: 'string' },
        },
    },
    function: changeNextDuty,
};