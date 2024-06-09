const createGoogleMeet = async ({ channel_id, users, summary, startDate, startTime, duration }) => {
    return {
        data: 'Not implemented',
    };
}

module.exports = {
    name: 'createGoogleMeet',
    description: 'Создание встречи (события, собрания, мита) в Google Meet.',
    parameters: {
        type: 'object',
        properties: {
            channel_id: { type: 'string' },
            users: { type: 'string', description: 'Список пользователей, начиная с @, разделенных запятой' },
            summary: { type: 'string', description: 'Наименование встречи' },
            startDate: { type: 'string', description: 'Дата (формат YYYY-MM-DD) начала события. "null" если не указан явно' },
            startTime: { type: 'string', description: 'Время (формат hh:mm) начала события. "null" если не указан явно' },
            duration: { type: 'integer', description: 'Продолжительность в минутах. "15" если не указан явно' },
        },
    },
    returns: {
        type: "string",
        description: "Ссылка на встречу в Google Meet. Ее обязательно надо отравить в следующем сообщении"
    },
    function: createGoogleMeet,
};