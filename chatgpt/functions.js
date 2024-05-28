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
    },
    {
        name: 'describeReminderCommands',
        description: 'Возвращает описание команд для напоминаний',
        function: describeReminderCommands,
    },
    {
        name: 'describeDutyCommands',
        description: 'Возвращает описание команд для графика дежурств',
        function: describeDutyCommands,
    },
    {
        name: 'describeInviteCommands',
        description: 'Возвращает описание команд для приглашения в приватный канал',
        function: describeInviteCommands,
    },
    {
        name: 'describeCalendarCommands',
        description: 'Возвращает описание команд для интеграции с Google Календарем',
        function: describeCalendarCommands,
    },
    {
        name: 'describeJiraCommands',
        description: 'Возвращает описание команд для логирования времени в Jira',
        function: describeJiraCommands,
    },
    {
        name: 'describeForwardingCommands',
        description: 'Возвращает описание команд для пересылки сообщений',
        function: describeForwardingCommands,
    },
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
    try {
        var result = await openAiHelpers.generateImages({ prompt });
        const filename = `${uuidv4()}.png`;
        const fileBuffer = Buffer.from(result.b64_json, 'base64');
        const file = await mattermostHelpers.uploadFile(fileBuffer, filename, channel_id);
        return {
            data: result.revised_prompt,
            fileId: file.file_infos[0].id,
        };
    } catch (error) {
        logger.error(`Error: ${error.message}\nStack trace:\n${error.stack}`);
        return {
            data: `При генерации изображения произошла ошибка`
        }
    }
}

async function describeReminderCommands() {
    const message = `
    **Команды для напоминаний:**
    \`!reminder; [cron-расписание]; [сообщение]\` - Устанавливает напоминание с указанным сообщением по cron-расписанию.
    \`!reminder-remove; [id]\` - Удаляет напоминание с указанным ID.
    \`!reminder-list\` - Отображает список всех установленных напоминаний.
    \`!reminder-help\` - Показывает все доступные команды для функционала напоминаний.
    `;
    return { data: message };
}

async function describeDutyCommands() {
    const message = `
    **Команды для графика дежурств:**
    \`!duty; [cron-расписание]; [список пользователей]\` - Устанавливает график дежурств. Список пользователей должен быть через запятую.
    \`!duty-remove\` - Удаляет график дежурств для текущего канала.
    \`!duty-current\` - Отображает текущего дежурного для канала.
    \`!duty-next\` - Переходит к следующему пользователю в списке дежурных для текущего канала.
    \`!duty-help\` - Отображает все доступные команды для функционала графика дежурств.
    `;
    return { data: message };
}

async function describeInviteCommands() {
    const message = `
    **Команды для приглашения в канал:**
    \`!invite; [ссылка на канал/название канала]\` - Приглашает пользователя в указанный канал. Можно использовать либо ссылку на канал, либо его название. Примеры:
    - Использование названия канала: \`!invite; general\`
    - Использование ссылки на канал: \`https://your-mattermost-server.com/teamname/channels/general\`

    Также можно воспользоваться командой \`!invite\` без параметров, чтобы получить ссылку на UI со списком доступных каналов для входа.
    `;
    return { data: message };
}

async function describeCalendarCommands() {
    const message = `
    **Команды для интеграции с Google Календарем:**
    \`!calendar\` - Инициирует процесс интеграции с Google Календарем. После вызова команды пользователь получит ссылку для предоставления доступа боту к их данным Google Календаря.
    \`!calendar-remove\` - Удаляет интеграцию с Google Календарем для текущего пользователя. Это действие отзовет разрешение бота на доступ к Google Календарю пользователя.
    \`!meet\` - Создает встречу в Google Meet. Варианты:
    - \`!meet\` - Создает быструю встречу с настройками по умолчанию.
    - \`!meet; [список пользователей]\` - Создает встречу с указанными пользователями.
    - \`!meet; [список пользователей]; [название встречи]\` - Создает встречу с указанным названием и пользователями.
    - \`!meet; [список пользователей]; [название встречи]; [60m|1h]\` - Дополнительно устанавливает продолжительность встречи в минутах или часах. По умолчанию 15 минут, если продолжительность не указана.
    - Альтернативный синтаксис: \`!meet Встреча @username1 @username2 @username3\` или \`!meet @username1 @username2 @username3 Встреча 15m\`.
    `;
    return { data: message };
}

async function describeJiraCommands() {
    const message = `
    **Команды для логирования времени в Jira:**
    \`!jira\` - Инициирует процесс логирования рабочего времени в Jira с использованием данных календаря.
    `;
    return { data: message };
}

async function describeForwardingCommands() {
    const message = `
    **Команды для пересылки сообщений:**
    \`!forward; [id исходного канала]; [id целевого канала]; [сообщение]; [сообщение в треде]\` - Устанавливает пересылку сообщений из исходного канала в целевой с дополнительным сообщением и опциональным сообщением в треде.
    \`!forward-list\` - Отображает список всех конфигураций пересылки сообщений.
    \`!forward-remove; [id]\` - Удаляет конкретную конфигурацию пересылки сообщений по его ID.
    \`!forward-help\` - Показывает все доступные команды для функционала пересылки сообщений.
    `;
    return { data: message };
}

module.exports = {
    functions,
};
