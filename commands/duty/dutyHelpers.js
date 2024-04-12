const { getCurrentDuty: getDutyFromDB, getDutyUsers, setCurrentDuty } = require('../../db/models/duty');
const logger = require('../../logger');
const resources = require('../../resources');

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
        const currentDuty = await getDutyFromDB(channel_id);
        let message = resources.duty.noCurrent;
        let users = await getDutyUsers(channel_id);
        users = users.filter(user => !user.is_disabled);
        if (users.length === 0) {
            message = resources.duty.noExistingError;
        } else if (currentDuty) {
            let nextIndex = (users.findIndex(u => u.user_id === currentDuty.user_id) + 1) % users.length;
            const nextDuty = users[nextIndex].user_id;
            await setCurrentDuty(channel_id, nextDuty);
            message = resources.duty.nextNotification.replace('{user}', nextDuty);
        }
        return message;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}

module.exports = {
    getCurrentDuty,
    changeNextDuty,
};