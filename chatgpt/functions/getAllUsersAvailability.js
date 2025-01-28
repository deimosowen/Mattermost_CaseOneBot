const moment = require('moment');
const { getChannelMembers, getUser } = require('../../mattermost/utils');
const absenceService = require('../../services/absenceService');
const logger = require('../../logger');

const getAllUsersAvailability = async ({ channel_id, date }) => {
    try {
        const members = await getChannelMembers(channel_id);
        const usersIds = members.map(member => member.user_id);
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
            console.log(email);
            console.log(availability);
            console.log(Object.values(availability)[0]);
            const isAbsent = !Object.values(availability)[0];
            if (isAbsent) {
                const username = emailToUsernameMap[email];
                acc[`@${username}`] = 'не работает';
            }
            return acc;
        }, {});

        return {
            data: JSON.stringify(transformedResponse),
        };
    } catch (error) {
        console.log(error);

        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        return {
            data: 'При выполнении запроса произошла ошибка',
        };
    }
}

module.exports = {
    name: 'getAllUsersAvailability',
    description: 'Получить данные по отсутствиям(отпуска, больничные, отгулы) всех сотрудников на указанную дату. Если дата не указана, то на текущую дату',
    parameters: {
        type: 'object',
        properties: {
            channel_id: { type: 'string' },
            date: { type: 'string', description: 'Дата (формат YYYY-MM-DD). Null, если не указана явно' },
        },
    },
    function: getAllUsersAvailability,
};