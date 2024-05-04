const dutyService = require('../services/dutyService');

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
        function: dutyService.getCurrentDuty,
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
        name: 'rotateDuty',
        description: 'Передвигает (сдвигает) дежурного, если текущий не может сегодня дежурить',
        parameters: {
            type: 'object',
            properties: {
                channel_id: { type: 'string' },
            },
        },
        function: dutyService.rotateDuty,
    },
    {
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
        function: dutyService.updateDutyActivityStatus,
    },
    {
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
    }
];

async function changeNextDuty({ channel_id }) {
    return dutyService.changeNextDuty(channel_id);
}

//TODO: Implement this function
async function createGoogleMeet({ channel_id, users, summary, startDate, startTime, duration }) {
    return ``
}

module.exports = {
    functions,
};
