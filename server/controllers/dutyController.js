const express = require('express');
const moment = require('moment');
const cronstrue = require('cronstrue');
const { rotateDuty, changeNextDuty } = require('../../services/dutyService');
const { getDutySchedule, getDutyUsers,
    getCurrentDuty, updateUserActivityStatus,
    getUnscheduledList, removeDutyUser, addDutyUser,
    updateDutyUsersOrder, getDutySchedules, getAllChannelsWithCurrentDuty } = require('../../db/models/duty');
const { getUserByUsernameOrEmail, postMessage, getChannelById, getUser, getUserByUsername, getChannelMembers } = require('../../mattermost/utils');
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

        // Получаем информацию о канале
        let channel = null;
        try {
            const channelData = await getChannelById(channel_id);
            if (channelData) {
                channel = {
                    id: channelData.id,
                    name: channelData.display_name || channelData.name || `Канал ${channel_id}`
                };
            }
        } catch (error) {
            logger.warn(`Could not get channel info for ${channel_id}:`, error);
        }

        // Получаем расписание для расчета дат дежурства
        let schedule = null;
        try {
            const dutySchedule = await getDutySchedule(channel_id);
            if (dutySchedule) {
                schedule = {
                    cron_schedule: dutySchedule.cron_schedule,
                    use_working_days: Boolean(dutySchedule.use_working_days)
                };
            }
        } catch (error) {
            logger.warn(`Could not get duty schedule for ${channel_id}:`, error);
        }

        // Определяем индекс текущего дежурного для расчета дат
        // Ищем сотрудника со статусом "Текущий"
        let currentDutyIndex = employees.findIndex(emp => emp.status === 'Текущий');
        
        // Получаем тип текущего дежурного (для учета внеочередных)
        let isCurrentDutyUnscheduled = false;
        if (currentDuty && currentDuty.duty_type) {
            const DutyType = require('../../types/dutyTypes');
            isCurrentDutyUnscheduled = currentDuty.duty_type === DutyType.UNSCHEDULED;
        }

        res.render('dutySettings', { 
            employees, 
            statusBadgeClasses, 
            channel_id, 
            channel,
            schedule,
            currentDutyIndex,
            isCurrentDutyUnscheduled
        });
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
        res.json({ success: true, message: 'Порядок обновлен' });
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ success: false, message: 'Ошибка при обновлении порядка пользователей' });
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

router.post('/next-duty-date', async (req, res) => {
    const { cron_schedule, use_working_days, shifts_ahead, timezone } = req.body;
    try {
        if (!cron_schedule || shifts_ahead === undefined) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const dayOffService = require('../../services/dayOffService');
        
        // Используем cron-parser для точного расчета
        let parser;
        try {
            parser = require('cron-parser');
        } catch (e) {
            // Если cron-parser недоступен, используем упрощенный расчет
            logger.warn('cron-parser not available, installing...');
            return res.status(500).json({ error: 'cron-parser library required' });
        }
        
        // Начинаем с текущей даты в указанном timezone
        let currentDate = moment.tz(timezone || TZ || 'UTC');
        let nextDate = null;
        let iterations = 0;
        const maxIterations = shifts_ahead * 20; // Защита от бесконечного цикла

        // Рассчитываем дату через N смен
        while (iterations < shifts_ahead && iterations < maxIterations) {
            try {
                // Создаем парсер с текущей датой как отправной точкой
                const interval = parser.parseExpression(cron_schedule, {
                    tz: timezone || TZ || 'UTC',
                    currentDate: currentDate.toDate()
                });
                
                // Получаем следующую дату выполнения cron
                nextDate = moment(interval.next().toDate());
                
                // Если нужно учитывать рабочие дни, пропускаем выходные
                if (use_working_days) {
                    let attempts = 0;
                    const maxAttempts = 30; // Защита от бесконечного цикла
                    while (await dayOffService.isHoliday(nextDate) && attempts < maxAttempts) {
                        // Если дата выходная, переходим к следующему дню и ищем следующее выполнение cron
                        const nextDay = nextDate.clone().add(1, 'day').startOf('day');
                        const nextInterval = parser.parseExpression(cron_schedule, {
                            tz: timezone || TZ || 'UTC',
                            currentDate: nextDay.toDate()
                        });
                        nextDate = moment(nextInterval.next().toDate());
                        attempts++;
                    }
                }

                // Для следующей итерации используем полученную дату как отправную точку
                // Добавляем небольшую задержку (1 секунда), чтобы следующее выполнение cron было после этой даты
                currentDate = nextDate.clone().add(1, 'second');
                iterations++;
            } catch (error) {
                logger.error(`Error calculating next cron date: ${error.message}`);
                break;
            }
        }

        if (nextDate) {
            res.json({ nextDate: nextDate.toISOString() });
        } else {
            res.status(500).json({ error: 'Не удалось рассчитать дату' });
        }
    } catch (error) {
        logger.error(`Error in next-duty-date: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Список всех дежурств
router.get('/list', async (req, res) => {
    try {
        const user_id = req.user?.mattermostUserId;

        if (!user_id) {
            return res.render('dutyList', {
                duties: [],
                error: 'Необходима авторизация для просмотра списка дежурств'
            });
        }

        // Получаем все каналы с дежурствами (из duty_schedule и duty_current)
        const schedules = await getDutySchedules();
        const allChannelIds = new Set();

        // Добавляем каналы из расписаний
        schedules.forEach(schedule => allChannelIds.add(String(schedule.channel_id)));

        // Также получаем каналы из duty_current (текущие дежурства)
        const allCurrentDuties = await getAllChannelsWithCurrentDuty();
        allCurrentDuties.forEach(duty => allChannelIds.add(String(duty.channel_id)));

        // Проверяем, является ли пользователь администратором
        const isAdmin = res.locals.user?.isAdmin || req.user?.isAdmin || false;

        // Фильтруем каналы: для админов показываем все, для обычных пользователей - только те, где они участники
        let userChannels = [];
        if (isAdmin) {
            // Администратор видит все каналы
            userChannels = Array.from(allChannelIds);
            logger.debug(`Admin user ${user_id}: showing all ${userChannels.length} channels`);
        } else {
            // Обычный пользователь видит только каналы, где он участник
            for (const channelId of allChannelIds) {
                try {
                    const members = await getChannelMembers(channelId);
                    const isMember = members.some(member => String(member.user_id) === String(user_id));
                    if (isMember) {
                        userChannels.push(channelId);
                    }
                } catch (err) {
                    logger.warn(`Could not check membership for channel ${channelId}:`, err);
                }
            }
            logger.debug(`Filtered channels: ${userChannels.length} out of ${allChannelIds.size} (checked membership for user ${user_id})`);
        }

        // Получаем информацию о каждом канале с дежурством
        const dutiesPromises = userChannels.map(async (channelId) => {
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
                        const userDetails = await getUserByUsername(currentDuty.user_id.substring(1));
                        if (userDetails) {
                            currentDutyUser = {
                                id: currentDuty.user_id,
                                name: `${userDetails.first_name || ''} ${userDetails.last_name || ''}`.trim() || userDetails.username,
                                username: userDetails.username
                            };
                        }
                    } catch (err) {
                        logger.error(err);
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