const calendarService = require('../../services/calendarService');
const { getUserByUsername } = require('../../mattermost/utils');

const findFreeTimeSlots = async ({ user_id, usernames, duration, requiredSlots }) => {
    const participants = await Promise.all(usernames.map(async (username) => {
        const cleanedUsername = username.replace(/^@/, '');
        const user = await getUserByUsername(cleanedUsername);
        return user.email;
    }));

    const result = await calendarService.findFreeTimeSlotForGroup(user_id, participants, duration, requiredSlots);

    return {
        data: JSON.stringify(result),
    };
}

module.exports = {
    name: 'findFreeTimeSlots',
    description: 'Ищет ближайшие свободные временные окна для группы участников с указанной продолжительностью, учитывая выходные и рабочие часы с 6 утра до 15 часов UTC.',
    parameters: {
        type: 'object',
        properties: {
            user_id: {
                type: 'string'
            },
            usernames: {
                type: 'array',
                items: {
                    type: 'string'
                },
                description: 'Массив участников, начиная с @'
            },
            duration: {
                type: 'number',
                description: 'Длительность свободного временного окна в минутах. Значение по умолчанию, если не указанно явно: 30 минут',
                default: 30
            },
            requiredSlots: {
                type: 'number',
                description: 'Количество необходимых свободных временных окон. Значение по умолчанию, если не указано явно: 5',
                default: 5
            }
        }
    },
    returns: {
        type: 'object',
        description: 'Массив объектов с данными временных окон в UTC.',
        items: {
            type: 'object',
            properties: {
                start: {
                    type: 'string',
                    description: 'Время начала свободного временного окна в формате ISO.'
                },
                end: {
                    type: 'string',
                    description: 'Время окончания свободного временного окна в формате ISO.'
                }
            }
        }
    },
    function: findFreeTimeSlots,
};