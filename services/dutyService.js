const moment = require('moment');
const dayOffAPI = require('isdayoff')();
const { getCurrentDuty: getDutyFromDB, getDutyUsers,
    setCurrentDuty, updateUserActivityStatus, addUnscheduledUser,
    getFirstUnscheduledUser, deleteUnscheduledUser } = require('../db/models/duty');
const { postMessage } = require('../mattermost/utils');
const logger = require('../logger');
const resources = require('../resources');
const DutyType = require('../types/dutyTypes.js');

// Получение текущего дежурного
async function getCurrentDuty(channel_id) {
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

// Смена дежурного
async function changeNextDuty(channel_id) {
    try {
        const unscheduledDuty = await changeUnscheduledDutyIfNeed(channel_id);
        if (unscheduledDuty) {
            return unscheduledDuty;
        }

        let users = await getActualDutyList(channel_id);
        users = users.filter(user => !user.is_disabled);
        if (users.length === 0) {
            return resources.duty.noUsersError;
        }

        const currentDuty = await getDutyFromDB(channel_id);
        if (!currentDuty) {
            return resources.duty.noExistingError;
        }

        const increment = currentDuty.duty_type === DutyType.UNSCHEDULED ? 2 : 1;
        let nextIndex = (users.findIndex(u => u.user_id === currentDuty.user_id) + increment) % users.length;
        const nextDuty = users[nextIndex].user_id;
        await setCurrentDuty(channel_id, nextDuty, DutyType.REGULAR);
        return resources.duty.nextNotification.replace('{user}', nextDuty);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}

// Обновление статуса активности пользователя
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

async function rotateDuty(channel_id) {
    const currentDuty = await getDutyFromDB(channel_id);
    const result = await changeNextDuty(channel_id);
    await addUnscheduledUser(channel_id, currentDuty.user_id);
    return result;
}

// Получение актуального списка дежурных
const getActualDutyList = async (channel_id) => {
    const currentDate = moment().format('YYYY-MM-DD');
    let users = await getDutyUsers(channel_id);
    users.map(async user => {
        if (user.return_date && moment(user.return_date, 'YYYY-MM-DD').isBefore(currentDate)) {
            user.is_disabled = false;
            user.return_date = null;
            await updateUserActivityStatus(user.id, user.is_disabled, user.return_date);
        }
    });
    users = users.filter(user => !user.is_disabled);
    return users;
};

// Проверка наличия внеочередных дежурных и установка первого из них в качестве текущего дежурного
async function changeUnscheduledDutyIfNeed(channel_id) {
    let unscheduledUser = await getFirstUnscheduledUser(channel_id);
    if (unscheduledUser) {
        await deleteUnscheduledUser(unscheduledUser.id);
        await setCurrentDuty(channel_id, unscheduledUser.user_id, DutyType.UNSCHEDULED);
        return resources.duty.nextNotification.replace('{user}', unscheduledUser.user_id);
    }
}

// Создание callback для cron-задачи
const createDutyCallback = (channel_id, considerWorkingDays = false) => {
    return async () => {
        if (considerWorkingDays) {
            const isHoliday = await dayOffAPI.today();
            if (isHoliday) {
                return;
            }
        }
        const changeResult = await changeNextDuty(channel_id);
        postMessage(channel_id, changeResult);
    };
};

module.exports = {
    getCurrentDuty,
    changeNextDuty,
    rotateDuty,
    createDutyCallback,
    updateDutyActivityStatus,
};