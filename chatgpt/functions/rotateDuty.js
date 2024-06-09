const dutyService = require('../../services/dutyService');

const rotateDuty = async ({ channel_id }) => {
    const result = await dutyService.rotateDuty(channel_id);
    return {
        data: result,
    };
}

module.exports = {
    name: 'rotateDuty',
    description: 'Передвигает (сдвигает) дежурного, если текущий не может сегодня дежурить',
    parameters: {
        type: 'object',
        properties: {
            channel_id: { type: 'string' },
        },
    },
    function: rotateDuty,
};