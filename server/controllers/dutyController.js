const express = require('express');
const moment = require('moment');
const cronstrue = require('cronstrue');
const { rotateDuty, changeNextDuty } = require('../../services/dutyService');
const { getDutySchedule, getDutyUsers,
    getCurrentDuty, updateUserActivityStatus,
    getUnscheduledList, removeDutyUser, addDutyUser,
    updateDutyUsersOrder, getDutySchedules, getAllChannelsWithCurrentDuty } = require('../../db/models/duty');
const { getUserByUsernameOrEmail, postMessage, getChannelById, getUser } = require('../../mattermost/utils');
const { TZ } = require('../../config');
const logger = require('../../logger');
require('cronstrue/locales/ru');

const router = express.Router();

router.get('/', async (req, res) => {
    const { channel_id } = req.query;

    try {
        const currentDuty = await getCurrentDuty(channel_id);
        const unscheduledUsers = await getUnscheduledList(channel_id);
        let users = await getDutyUsers(channel_id);
        users = users.sort((a, b) => a.order_number - b.order_number);

        const userPromises = users.map(async (user) => {
            const userDetails = await getUserByUsernameOrEmail(user.user_name);

            let status;
            if (user.is_disabled) {
                status = 'Отключен';
            } else if (currentDuty && user.user_id === currentDuty.user_id) {
                status = 'Текущий';
            } else {
                status = 'Активный';
            }

            return {
                id: user.id,
                username: userDetails?.username,
                name: `${userDetails?.first_name} ${userDetails?.last_name}`,
                status: status,
                isUnsheduled: unscheduledUsers.some(u => u.user_id === user.user_id),
                return_date: user.return_date ? moment(user.return_date).format('DD-MM-YYYY') : null,
            };

        });

        const employees = await Promise.all(userPromises);
        const statusBadgeClasses = {
            'Активный': 'bg-primary',
            'Текущий': 'bg-success',
            'Отключен': 'bg-danger',
        };

        res.render('dutySettings', { employees, statusBadgeClasses, channel_id });
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
});

router.post('/update-status', async (req, res) => {
    try {
        const { id, status, channel_id, return_date } = req.body;
        const intStatus = parseInt(status);
        switch (intStatus) {
            case -1:
                const nextDuty = await rotateDuty(channel_id);
                postMessage(channel_id, nextDuty);
                break;
            default:
                const returnDate = return_date ? moment(return_date).format('YYYY-MM-DD') : null;
                await updateUserActivityStatus(id, status, returnDate);
                break;
        }
        res.redirect(`/duty?channel_id=${channel_id}`);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
});

router.post('/change-next', async (req, res) => {
    try {
        const { channel_id } = req.body;
        const nextDuty = await changeNextDuty(channel_id);
        postMessage(channel_id, nextDuty);
        res.redirect(`/duty?channel_id=${channel_id}`);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        res.redirect(`/duty?channel_id=${req.body.channel_id}`);
    }
});

router.post('/update-order', async (req, res) => {
    try {
        const { channel_id, order } = req.body;
        await updateDutyUsersOrder(channel_id, order);
        res.json({ message: 'OK' });
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ message: 'Ошибка при обновлении порядка пользователей' });
    }
});

router.post('/add-user', async (req, res) => {
    const { username, channel_id } = req.body;
    try {
        const userDetails = await getUserByUsernameOrEmail(username);
        if (userDetails) {
            await addDutyUser(channel_id, `@${userDetails.username}`, 999);
        }
        res.redirect(`/duty?channel_id=${channel_id}`);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        res.redirect(`/duty?channel_id=${channel_id}`);
    }
});

router.post('/delete-user', async (req, res) => {
    try {
        const { id, channel_id } = req.body;
        await removeDutyUser(id, channel_id);
        res.redirect(`/duty?channel_id=${channel_id}`);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
});

router.post('/schedule', async (req, res) => {
    const { channel_id, timezone } = req.body;
    try {
        const schedule = await getDutySchedule(channel_id);
        const tzOffset = moment.tz(timezone).utcOffset() / 60;
        const isWorkingDays = schedule.use_working_days ? ', с учетом рабочих дней' : '';
        const cronDescription = `${cronstrue.toString(schedule.cron_schedule, { locale: "ru", tzOffset: tzOffset })} ${isWorkingDays}`;

        res.json({ cronDescription });
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Список всех дежурств
router.get('/list', async (req, res) => {
    try {
        // Получаем все каналы с дежурствами (из duty_schedule и duty_current)
        const schedules = await getDutySchedules();
        const allChannelIds = new Set();

        // Добавляем каналы из расписаний
        schedules.forEach(schedule => allChannelIds.add(schedule.channel_id));

        // Также получаем каналы из duty_current (текущие дежурства)
        const allCurrentDuties = await getAllChannelsWithCurrentDuty();
        allCurrentDuties.forEach(duty => allChannelIds.add(duty.channel_id));

        // Получаем информацию о каждом канале с дежурством
        const dutiesPromises = Array.from(allChannelIds).map(async (channelId) => {
            try {
                const channel = await getChannelById(channelId);
                const currentDuty = await getCurrentDuty(channelId);
                const schedule = await getDutySchedule(channelId);

                // Получаем название канала
                let channelName = `Канал ${channelId}`;
                if (channel) {
                    channelName = channel.display_name || channel.name || channelName;
                }

                // Получаем информацию о текущем дежурном
                let currentDutyUser = null;
                if (currentDuty && currentDuty.user_id) {
                    try {
                        // Пробуем получить пользователя по ID напрямую
                        const userDetails = await getUser(currentDuty.user_id);
                        if (userDetails) {
                            currentDutyUser = {
                                id: currentDuty.user_id,
                                name: `${userDetails.first_name || ''} ${userDetails.last_name || ''}`.trim() || userDetails.username,
                                username: userDetails.username
                            };
                        } else {
                            // Если не получилось по ID, пробуем по username/email
                            const userDetailsAlt = await getUserByUsernameOrEmail(currentDuty.user_id);
                            if (userDetailsAlt) {
                                currentDutyUser = {
                                    id: currentDuty.user_id,
                                    name: `${userDetailsAlt.first_name || ''} ${userDetailsAlt.last_name || ''}`.trim() || userDetailsAlt.username,
                                    username: userDetailsAlt.username
                                };
                            }
                        }
                    } catch (err) {
                        logger.warn(`Could not get user details for ${currentDuty.user_id}:`, err);
                        // Если не удалось получить данные пользователя, все равно показываем что дежурный назначен
                        currentDutyUser = {
                            id: currentDuty.user_id,
                            name: currentDuty.user_id,
                            username: null
                        };
                    }
                }

                // Получаем описание расписания
                let scheduleDescription = null;
                if (schedule && schedule.cron_schedule) {
                    try {
                        const timezone = TZ || 'UTC';
                        const tzOffset = moment.tz(timezone).utcOffset() / 60;
                        const isWorkingDays = schedule.use_working_days ? ', с учетом рабочих дней' : '';
                        scheduleDescription = `${cronstrue.toString(schedule.cron_schedule, { locale: "ru", tzOffset: tzOffset })} ${isWorkingDays}`.trim();
                    } catch (err) {
                        logger.warn(`Could not parse schedule for channel ${channelId}:`, err);
                    }
                }

                return {
                    channelId: channelId,
                    channelName: channelName,
                    currentDuty: currentDutyUser,
                    hasSchedule: !!schedule,
                    scheduleDescription: scheduleDescription
                };
            } catch (error) {
                logger.warn(`Error processing channel ${channelId}:`, error);
                return {
                    channelId: channelId,
                    channelName: `Канал ${channelId}`,
                    currentDuty: null,
                    hasSchedule: false,
                    scheduleDescription: null,
                    error: true
                };
            }
        });

        const duties = await Promise.all(dutiesPromises);
        // Фильтруем только успешно загруженные каналы
        const validDuties = duties.filter(d => !d.error || d.currentDuty);

        res.render('dutyList', {
            duties: validDuties,
            error: null
        });
    } catch (error) {
        logger.error(`Error in duty list: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).render('dutyList', {
            duties: [],
            error: 'Ошибка при загрузке списка дежурств'
        });
    }
});

module.exports = router;