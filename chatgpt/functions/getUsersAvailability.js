const moment = require('moment');
const { getChannelMembers, getUser, getUserByUsername } = require('../../mattermost/utils');
const absenceService = require('../../services/absenceService');
const logger = require('../../logger');

const getUsersAvailability = async ({ channel_id, users, date }) => {
    try {
        let usersIds = [];
        if (users) {
            const usersList = users.split(/[,\s]+/).map(user => user.trim());
            usersIds = await Promise.all(usersList.map(async username => {
                try {
                    username = username.replace('@', '');
                    const user = await getUserByUsername(username);
                    return user.id;
                } catch (error) {
                    return null;
                }
            }));
            usersIds = usersIds.filter(id => id !== null);
        } else {
            return "Пользователи не указаны";
        }

        const emailToUsernameMap = {};

        const usersEmails = await Promise.all(usersIds.map(async userId => {
            const user = await getUser(userId);
            if (user.is_bot) {
                return null;
            }
            emailToUsernameMap[user.email] = user.username;
            return user.email;
        })).then(emails => emails.filter(email => email !== null && email !== undefined));

        const requestData = {
            employeeEmails: usersEmails,
            dates: date ? [moment(date).format('YYYY-MM-DD')] : [moment().format('YYYY-MM-DD')],
        };

        const response = await absenceService.checkEmployeeAvailabilityByDate(requestData);
        const transformedResponse = Object.entries(response).reduce((acc, [email, availability]) => {
            const username = emailToUsernameMap[email];
            const status = Object.values(availability)[0] ? 'работает' : 'не работает';
            acc[`@${username}`] = status;
            return acc;
        }, {});

        return {
            data: JSON.stringify(transformedResponse),
        };
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        return {
            data: 'При выполнении запроса произошла ошибка',
        };
    }
}

module.exports = {
    name: 'getUsersAvailability',
    description: 'Получить данные по отсутствиям(отпуска, больничные, отгулы) конкретных сотрудников на указанную дату. Если дата не указана, то на текущую дату',
    parameters: {
        type: 'object',
        properties: {
            channel_id: { type: 'string' },
            users: { type: 'string', description: 'Список пользователей, начиная с @, разделенных запятой или пробелом. Null, если не указано явно' },
            date: { type: 'string', description: 'Дат (формат YYYY-MM-DD). Null, если не указана явно' },
        },
    },
    function: getUsersAvailability,
};