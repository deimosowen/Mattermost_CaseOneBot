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

const toBool = (value) => value === true || value === 1 || value === '1';

// Смена дежурного
async function changeNextDuty(channel_id) {
    try {
        const proposal = await computeNextDutyChange(channel_id);
        if (!proposal.canChange) {
            return proposal.reason;
        }

        await proposal.apply();
        return proposal.message;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}

// Принудительная смена дежурного без проверок доступности.
// Используется только веб-интерфейсом после серверной проверки прав администратора.
async function forceChangeNextDuty(channel_id) {
    try {
        const proposal = await computeNextDutyChange(channel_id, { force: true });
        if (!proposal.canChange) {
            return proposal.reason;
        }

        await proposal.apply();
        return proposal.message;
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
const getActualDutyList = async (channel_id, dutyUsers = null) => {
    try {
        const currentDate = moment().format('YYYY-MM-DD');
        const currentDateISO = moment(currentDate).toISOString();
        let users = dutyUsers || await getDutyUsers(channel_id) || [];

        // Обновляем статусы пользователей, которые уже должны вернуться
        const currentDateMoment = moment(currentDate);
        const usersToReactivate = users.filter(user =>
            user.return_date && moment(user.return_date).isSameOrBefore(currentDateMoment, 'day')
        );
        if (usersToReactivate.length > 0) {
            await Promise.all(usersToReactivate.map(async (user) => {
                await updateUserActivityStatus(user.id, false, null);
                user.is_disabled = false;
                user.return_date = null;
            }));
        }

        // Получаем email'ы пользователей из Mattermost
        const mattermostUsers = await Promise.all(
            users.map(async (user) => {
                try {
                    return await getUserByUsernameOrEmail(user.user_name);
                } catch (error) {
                    logger.warn(`Could not get Mattermost user for duty ${user.user_name}: ${error.message}`);
                    return null;
                }
            })
        );
        const employeeEmails = mattermostUsers
            .map(user => user?.email)
            .filter(Boolean);

        // Проверяем доступность
        const availability = employeeEmails.length > 0
            ? await absenceService.checkEmployeeAvailabilityByDate({
                employeeEmails,
                dates: [currentDate]
            })
            : {};

        // Обновляем статусы пользователей
        if (availability && Object.keys(availability).length > 0) {
            const updatePromises = users.map(async (user, index) => {
                const mattermostUser = mattermostUsers[index];
                if (!mattermostUser?.email) {
                    return;
                }

                const isAvailable = availability[mattermostUser.email]?.[currentDateISO];

                if (isAvailable === false) {
                    user.is_disabled = true;
                    await updateUserActivityStatus(user.id, user.is_disabled, currentDate);
                }
            });
            await Promise.all(updatePromises);
        }

        return users.filter(user => !toBool(user.is_disabled));

    } catch (error) {
        logger.error(`Error in getActualDutyList: ${error.message}\nStack trace:\n${error.stack}`);
        return [];
    }
};

// Вспомогательная функция: вычисляет следующего дежурного и сообщение БЕЗ изменений в БД
async function computeNextDutyChange(channel_id, options = {}) {
    const { force = false } = options;
    const allUsers = await getDutyUsers(channel_id) || [];
    const candidateUsers = force ? allUsers : await getActualDutyList(channel_id, allUsers);

    if (!candidateUsers || candidateUsers.length === 0) {
        return { canChange: false, reason: resources.duty.noUsersError };
    }

    // Проверяем внеочередных
    const unscheduledUsers = await getAllUnscheduledUsers(channel_id);
    if (unscheduledUsers && unscheduledUsers.length > 0) {
        for (const unscheduledUser of unscheduledUsers) {
            const isAvailable = candidateUsers.some(u => u.user_id === unscheduledUser.user_id);
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
    const currentIndexInAll = allUsers.findIndex(u => u.user_id === currentDuty.user_id);

    if (currentIndexInAll === -1) {
        return { canChange: false, reason: resources.duty.noExistingError };
    }

    const candidateUserIds = new Set(candidateUsers.map(user => user.user_id));
    let searchIndex = (currentIndexInAll + increment) % allUsers.length;

    for (let i = 0; i < allUsers.length; i++) {
        const nextUserId = allUsers[searchIndex].user_id;
        if (candidateUserIds.has(nextUserId)) {
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

// Создание callback для cron-задачи с подтверждением post.id и бесконечными ретраями раз в минуту
const createDutyCallback = (channel_id, considerWorkingDays = false) => {
    const RETRY_DELAY_MS = 60000; // 60 секунд между попытками

    const scheduleRetry = () => setTimeout(() => {
        attemptChange().catch((error) => {
            logger.error(`Duty retry failed: ${error.message}\nStack trace:\n${error.stack}`);
        });
    }, RETRY_DELAY_MS);

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

            // Если не получили post.id — планируем повтор через минуту, но не валим процесс.
            scheduleRetry();
            logger.error('Duty change not applied: Mattermost post not confirmed');
            return;
        } catch (error) {
            // Любая ошибка при публикации — пробуем снова через минуту, но не пробрасываем ошибку наружу cron.
            scheduleRetry();
            logger.error(`${error.message}\nStack trace:\n${error.stack}`);
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

// Получение следующего дежурного БЕЗ смены текущего (только для информации)
// Использует логику из computeNextDutyChange, но возвращает только информацию о следующем дежурном
async function getNextDuty(channel_id) {
    try {
        const result = await computeNextDutyChange(channel_id);
        if (result && result.canChange && result.userId) {
            return { user_id: result.userId, duty_type: result.dutyType };
        }
        // Если computeNextDutyChange вернул ошибку, но есть пользователи, возвращаем первого
        const actualUsers = await getActualDutyList(channel_id);
        if (actualUsers && actualUsers.length > 0) {
            return { user_id: actualUsers[0].user_id, duty_type: DutyType.REGULAR };
        }
        return null;
    } catch (error) {
        logger.error(`Error in getNextDuty: ${error.message}\nStack trace:\n${error.stack}`);
        return null;
    }
}

module.exports = {
    getCurrentDuty,
    changeNextDuty,
    forceChangeNextDuty,
    rotateDuty,
    createDutyCallback,
    updateDutyActivityStatus,
    getNextDuty,
};
