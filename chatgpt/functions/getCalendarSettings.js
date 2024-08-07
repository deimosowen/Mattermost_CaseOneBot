const { HOST } = require('../../config');

const getCalendarSettings = async ({ user_id }) => {
    const url = `${HOST}/calendar/settings?user_id=${user_id}`;
    const message = `Для настройки календаря перейдите по [ссылке](${url})`;
    return {
        data: message,
    };
}

module.exports = {
    name: 'getCalendarSettings',
    description: 'Возвращает ссылку на странице настроек календаря',
    parameters: {
        type: 'object',
        properties: {
            user_id: { type: 'string' },
        },
    },
    function: getCalendarSettings,
};