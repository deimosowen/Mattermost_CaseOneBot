const { v4: uuidv4 } = require('uuid');
const dutyService = require('../services/dutyService');
const openAiHelpers = require('./helpers');
const mattermostHelpers = require('../mattermost/fileHelper');

const functions = [
    {
        name: 'createImages',
        description: 'Создание картинки из текста',
        parameters: {
            type: 'object',
            properties: {
                channel_id: { type: 'string' },
                prompt: { type: 'string', description: 'Текст, который будет использован для генерации картинки' },
            },
        },
        function: createImages,
    },
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
        name: 'rotateDuty',
        description: 'Передвигает (сдвигает) дежурного, если текущий не может сегодня дежурить',
        parameters: {
            type: 'object',
            properties: {
                channel_id: { type: 'string' },
            },
        },
        function: rotateDuty,
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
        function: updateDutyActivityStatus,
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

async function getCurrentDuty({ channel_id }) {
    const result = await dutyService.getCurrentDuty(channel_id);
    return {
        data: result,
    };
}

async function changeNextDuty({ channel_id }) {
    const result = await dutyService.changeNextDuty(channel_id);
    return {
        data: result,
    };
}

async function rotateDuty({ channel_id }) {
    const result = await dutyService.rotateDuty(channel_id);
    return {
        data: result,
    };
}

async function updateDutyActivityStatus({ channel_id, username, isDisabled, returnDate }) {
    const result = await dutyService.updateDutyActivityStatus(channel_id, username, isDisabled, returnDate);
    return {
        data: result,
    };
}

//TODO: Implement this function
async function createGoogleMeet({ channel_id, users, summary, startDate, startTime, duration }) {
    return {
        data: 'Not implemented',
    };
}

async function createImages({ channel_id, prompt }) {
    var result = await openAiHelpers.generateImages({ prompt });
    const filename = `${uuidv4()}.png`;
    const fileBuffer = Buffer.from(result.b64_json, 'base64');
    const file = await mattermostHelpers.uploadFile(fileBuffer, filename, channel_id);
    return {
        data: result.revised_prompt,
        fileId: file.file_infos[0].id,
    };
}

module.exports = {
    functions,
};
