const moment = require('moment');
const dayOffAPI = require('isdayoff')();
const { getCurrentDuty: getDutyFromDB, getDutyUsers, getDutySchedule,
    setCurrentDuty, updateUserActivityStatus, addUnscheduledUser,
    deleteUnscheduledUser, getAllUnscheduledUsers } = require('../db/models/duty');
const { postMessage, getUserByUsernameOrEmail } = require('../mattermost/utils');
const absenceService = require('./absenceService');
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
        let users = await getActualDutyList(channel_id);
        if (users.length === 0) {
            return resources.duty.noUsersError;
        }

        const unscheduledDuty = await changeUnscheduledDutyIfNeed(channel_id, users);
        if (unscheduledDuty) {
            return unscheduledDuty;
        }

        const currentDuty = await getDutyFromDB(channel_id);
        if (!currentDuty) {
            return resources.duty.noExistingError;
        }

        const increment = currentDuty.duty_type === DutyType.UNSCHEDULED ? 2 : 1;
        const currentIndex = users.findIndex(u => u.user_id === currentDuty.user_id);
        if (currentIndex === -1) {
            return resources.duty.noExistingError;
        }
        const nextIndex = (currentIndex + increment) % users.length;
        const nextDuty = users[nextIndex].user_id;
        await setCurrentDuty(channel_id, nextDuty, DutyType.REGULAR);
        const message = await nextDutyMessage(channel_id, nextDuty);
        return message;
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

// Смена дежурного, добавление внеочередного дежурного
async function rotateDuty(channel_id) {
    const currentDuty = await getDutyFromDB(channel_id);
    const result = await changeNextDuty(channel_id);
    await addUnscheduledUser(channel_id, currentDuty.user_id);
    return result;
}

// Получение актуального списка дежурных
const getActualDutyList = async (channel_id) => {
    try {
        const currentDate = moment().format('YYYY-MM-DD');
        const currentDateISO = moment(currentDate).toISOString();
        let users = await getDutyUsers(channel_id);

        // Обновляем статусы пользователей, которые уже должны вернуться
        const currentDateMoment = moment(currentDate);
        const usersToReactivate = users.filter(user =>
            user.return_date && moment(user.return_date).isSameOrBefore(currentDateMoment, 'day')
        );
        if (usersToReactivate.length > 0) {
            await Promise.all(usersToReactivate.map(user =>
                updateUserActivityStatus(user.id, false, null)
            ));
        }

        // Получаем email'ы пользователей из Mattermost
        const mattermostUsers = await Promise.all(
            users.map(user => getUserByUsernameOrEmail(user.user_name))
        );
        // Проверяем доступность
        const availability = await absenceService.checkEmployeeAvailabilityByDate({
            employeeEmails: mattermostUsers.map(user => user.email),
            dates: [currentDate]
        });

        // Обновляем статусы пользователей
        if (availability && Object.keys(availability).length > 0) {
            const updatePromises = users.map(async (user, index) => {
                const mattermostUser = mattermostUsers[index];
                const isAvailable = availability[mattermostUser.email]?.[currentDateISO];

                if (!isAvailable) {
                    user.is_disabled = true;
                    await updateUserActivityStatus(user.id, user.is_disabled, currentDate);
                }
            });
            await Promise.all(updatePromises);
        }

        return users.filter(user => !user.is_disabled);

    } catch (error) {
        logger.error(`Error in getActualDutyList: ${error.message}\nStack trace:\n${error.stack}`);
    }
};

// Проверка наличия внеочередных дежурных и установка первого из них в качестве текущего дежурного
async function changeUnscheduledDutyIfNeed(channel_id, actualUsers) {
    const unscheduledUsers = await getAllUnscheduledUsers(channel_id);
    if (!unscheduledUsers || unscheduledUsers.length === 0) {
        return null;
    }

    for (const unscheduledUser of unscheduledUsers) {
        // Проверяем, есть ли пользователь в актуальном списке (активен)
        const isAvailable = actualUsers.some(user => user.user_id === unscheduledUser.user_id);

        if (isAvailable) {
            // Если пользователь доступен, назначаем его дежурным
            await deleteUnscheduledUser(unscheduledUser.id);
            await setCurrentDuty(channel_id, unscheduledUser.user_id, DutyType.UNSCHEDULED);
            return await nextDutyMessage(channel_id, unscheduledUser.user_id);
        } else {
            // Если пользователь недоступен, просто удаляем его из списка внеочередных
            await deleteUnscheduledUser(unscheduledUser.id);
        }
    }

    return null;
}

// Вспомогательная функция: вычисляет следующего дежурного и сообщение БЕЗ изменений в БД
async function computeNextDutyChange(channel_id) {
    const actualUsers = await getActualDutyList(channel_id);
    if (!actualUsers || actualUsers.length === 0) {
        return { canChange: false, reason: resources.duty.noUsersError };
    }

    // Проверяем внеочередных
    const unscheduledUsers = await getAllUnscheduledUsers(channel_id);
    if (unscheduledUsers && unscheduledUsers.length > 0) {
        for (const unscheduledUser of unscheduledUsers) {
            const isAvailable = actualUsers.some(u => u.user_id === unscheduledUser.user_id);
            if (isAvailable) {
                const message = await nextDutyMessage(channel_id, unscheduledUser.user_id);
                // Отложенное применение
                const apply = async () => {
                    await deleteUnscheduledUser(unscheduledUser.id);
                    await setCurrentDuty(channel_id, unscheduledUser.user_id, DutyType.UNSCHEDULED);
                };
                return { canChange: true, userId: unscheduledUser.user_id, dutyType: DutyType.UNSCHEDULED, message, apply };
            }
        }
    }

    const currentDuty = await getDutyFromDB(channel_id);
    if (!currentDuty) {
        return { canChange: false, reason: resources.duty.noExistingError };
    }

    const increment = currentDuty.duty_type === DutyType.UNSCHEDULED ? 2 : 1;

    // Получаем полный список пользователей из БД для определения позиции
    const allUsers = await getDutyUsers(channel_id);
    const currentIndexInAll = allUsers.findIndex(u => u.user_id === currentDuty.user_id);

    if (currentIndexInAll === -1) {
        return { canChange: false, reason: resources.duty.noExistingError };
    }

    // Находим следующего пользователя в полном списке
    const nextIndexInAll = (currentIndexInAll + increment) % allUsers.length;
    const nextUserIdInAll = allUsers[nextIndexInAll].user_id;

    // Проверяем, доступен ли следующий пользователь
    const isNextUserAvailable = actualUsers.some(u => u.user_id === nextUserIdInAll);

    if (!isNextUserAvailable) {
        // Если следующий пользователь недоступен, ищем следующего доступного
        let searchIndex = nextIndexInAll;
        let foundAvailable = false;

        for (let i = 0; i < allUsers.length; i++) {
            const userId = allUsers[searchIndex].user_id;
            if (actualUsers.some(u => u.user_id === userId)) {
                const nextIndex = actualUsers.findIndex(u => u.user_id === userId);
                const nextUserId = actualUsers[nextIndex].user_id;
                const message = await nextDutyMessage(channel_id, nextUserId);
                const apply = async () => {
                    await setCurrentDuty(channel_id, nextUserId, DutyType.REGULAR);
                };
                return { canChange: true, userId: nextUserId, dutyType: DutyType.REGULAR, message, apply };
            }
            searchIndex = (searchIndex + 1) % allUsers.length;
        }

        return { canChange: false, reason: resources.duty.noUsersError };
    }

    const nextIndex = actualUsers.findIndex(u => u.user_id === nextUserIdInAll);
    const nextUserId = actualUsers[nextIndex].user_id;
    const message = await nextDutyMessage(channel_id, nextUserId);
    const apply = async () => {
        await setCurrentDuty(channel_id, nextUserId, DutyType.REGULAR);
    };
    return { canChange: true, userId: nextUserId, dutyType: DutyType.REGULAR, message, apply };
}

// Создание callback для cron-задачи с подтверждением post.id и бесконечными ретраями раз в минуту
const createDutyCallback = (channel_id, considerWorkingDays = false) => {
    const RETRY_DELAY_MS = 60000; // 60 секунд между попытками

    const scheduleRetry = () => setTimeout(() => attemptChange(), RETRY_DELAY_MS);

    const attemptChange = async () => {
        try {
            if (considerWorkingDays) {
                const isHoliday = await checkIsHoliday();
                if (isHoliday) return; // не ретраим по праздникам
            }

            const proposal = await computeNextDutyChange(channel_id);
            if (!proposal.canChange) {
                // Нет доступной смены — просто один раз информируем и прекращаем
                if (proposal.reason) {
                    await postMessage(channel_id, proposal.reason);
                }
                return;
            }

            const post = await postMessage(channel_id, proposal.message);
            if (post && post.id) {
                await proposal.apply();
                return; // успех
            }

            // Если не получили post.id — планируем повтор через минуту
            scheduleRetry();
        } catch (error) {
            // Любая ошибка при публикации — пробуем снова через минуту
            scheduleRetry();
        }
    };

    return async () => {
        await attemptChange();
    };
};

async function nextDutyMessage(channel_id, user_id) {
    const dutySchedule = await getDutySchedule(channel_id);
    return dutySchedule.nextDutyMessage.replace('{user}', user_id);
}

async function checkIsHoliday() {
    try {
        const isHoliday = await dayOffAPI.today();
        return isHoliday;
    } catch (error) {
        logger.error(`Error in isHoliday: ${error.message}\nStack trace:\n${error.stack}`);
        return false;
    }
}

module.exports = {
    getCurrentDuty,
    changeNextDuty,
    rotateDuty,
    createDutyCallback,
    updateDutyActivityStatus,
};