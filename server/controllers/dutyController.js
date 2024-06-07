const express = require('express');
const moment = require('moment');
const { rotateDuty } = require('../../services/dutyService');
const { getDutyUsers, getCurrentDuty, updateUserActivityStatus, getUnscheduledList } = require('../../db/models/duty');
const { getUserByUsername, postMessage } = require('../../mattermost/utils');
const logger = require('../../logger');

const router = express.Router();

router.get('/', async (req, res) => {
    const { channel_id } = req.query;
    try {
        const currentDuty = await getCurrentDuty(channel_id);
        const unscheduledUsers = await getUnscheduledList(channel_id);
        let users = await getDutyUsers(channel_id);
        users = users.sort((a, b) => a.order_number - b.order_number);

        const userPromises = users.map(async (user) => {
            const userName = user.user_name.startsWith('@') ? user.user_name.substring(1) : user.user_name;
            const userDetails = await getUserByUsername(userName);

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
                username: userDetails.username,
                name: `${userDetails.first_name} ${userDetails.last_name}`,
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

module.exports = router;