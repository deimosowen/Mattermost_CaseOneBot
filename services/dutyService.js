const moment = require('moment');
const { getCurrentDuty: getDutyFromDB, getDutyUsers,
    setCurrentDuty, updateUserActivityStatus } = require('../db/models/duty');
const logger = require('../logger');
const resources = require('../resources');

async function getCurrentDuty({ channel_id }) {
    try {
        let message = resources.duty.noCurrent;
        const currentDuty = await getDutyFromDB(channel_id);
        if (currentDuty) {
            message = resources.duty.currentNotification.replace('{user}', currentDuty.user_id);
        }
        return message;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}

async function changeNextDuty({ channel_id }) {
    try {
        let users = await getDutyUsers(channel_id);
        users = users.filter(user => !user.is_disabled);
        if (users.length === 0) {
            return resources.duty.noUsersError;
        }

        const currentDuty = await getDutyFromDB(channel_id);
        if (!currentDuty) {
            return resources.duty.noExistingError;
        }

        let nextIndex = (users.findIndex(u => u.user_id === currentDuty.user_id) + 1) % users.length;
        const nextDuty = users[nextIndex].user_id;
        await setCurrentDuty(channel_id, nextDuty);
        return resources.duty.nextNotification.replace('{user}', nextDuty);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}

async function updateDutyActivityStatus({ channel_id, username, isDisabled, returnDate }) {
    const users = await getDutyUsers(channel_id);
    if (!users) {
        return resources.duty.noUsersError;
    }

    const user = users.find(c => c.user_name === username);
    if (!user) {
        return resources.duty.notFoundError;
    }

    const formattedDate = returnDate ? moment(returnDate).format('YYYY-MM-DD') : null;
    await updateUserActivityStatus(user.id, isDisabled, formattedDate);

    return resources.duty.changeStatusSuccess.replace('{user}', username);
}

module.exports = {
    getCurrentDuty,
    changeNextDuty,
    updateDutyActivityStatus,
};