const express = require('express');
const moment = require('moment');
const cronstrue = require('cronstrue');
const { rotateDuty } = require('../../services/dutyService');
const { getDutySchedule, getDutyUsers,
    getCurrentDuty, updateUserActivityStatus,
    getUnscheduledList, removeDutyUser, addDutyUser,
    updateDutyUsersOrder } = require('../../db/models/duty');
const { getUserByUsername, getUserByUsernameOrEmail, postMessage } = require('../../mattermost/utils');
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

module.exports = router;