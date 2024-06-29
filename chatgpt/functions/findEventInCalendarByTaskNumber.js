const calendarService = require('../../services/calendarService');

const findEventInCalendarByTaskNumber = async ({ user_id, event, task_key }) => {
    const result = await calendarService.findEventByTaskNumber(user_id, event, task_key);
    return {
        data: JSON.stringify(result),
    };
}

module.exports = {
    name: 'findEventInCalendarByTaskNumber',
    description: 'Функция ищет событие в календаре по заданному номеру задачи и типу события',
    parameters: {
        type: 'object',
        properties: {
            user_id: {
                type: 'string'
            },
            event: {
                type: 'string',
                enum: ['демо', 'покер'],
                description: 'Тип события для поиска в календаре. Должен быть либо "демо", либо "покер"'
            },
            task_key: {
                type: 'string', description: 'Номер задачи в формате "CASEM-XXXXX"'
            },
        },
        required: ['event', 'task_key'],
    },
    returns: {
        type: "string",
        description: "Объект с данными события, включая ссылки на запись и задачу.",
        properties: {
            data: {
                type: 'object',
                properties: {
                    eventLink: {
                        type: 'string',
                        description: 'Ссылка на событие в календаре.'
                    },
                    taskLink: {
                        type: 'string',
                        description: 'Ссылка на задачу в описании события.'
                    },
                    recordingLink: {
                        type: 'string',
                        description: 'Ссылка на запись, если она существует.'
                    }
                }
            }
        }
    },
    function: findEventInCalendarByTaskNumber,
};