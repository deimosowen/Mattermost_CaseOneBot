const express = require('express');
const { getUserSettings, updateUserSettings } = require('../../db/models/calendars');
const yandexService = require('../../services/yandexService');
const logger = require('../../logger');

const router = express.Router();

router.get('/settings', async (req, res) => {
    const { user_id } = req.query;
    const credentials = yandexService.getCredentials();
    const isAuthenticated = await yandexService.isAuthenticated(user_id);
    const settings = await getUserSettings(user_id);

    res.render('calendarSettings', {
        user_id: user_id,
        credentials: credentials,
        isAuthenticated: isAuthenticated,
        settings: settings || {},
        success: req.query.success || false
    });
});

router.post('/settings', async (req, res) => {
    const parameters = req.body;
    const user_id = parameters.user_id;
    parameters.is_notification = parseInt(parameters.is_notification) || 0;
    parameters.dnd_mode = parseInt(parameters.dnd_mode) || 0;
    await updateUserSettings(user_id, parameters);
    res.redirect(`/calendar/settings?user_id=${user_id}&success=true`);
});

router.post('/auth', async (req, res) => {
    try {
        const { user_id, tokens } = req.body;
        await yandexService.createAuthUser(user_id, tokens);
        return res.status(200).send('OK');
    } catch (error) {
        logger.error(error);
        return res.status(500).send('Internal server error');
    }
});

router.post('/logout', async (req, res) => {
    try {
        const { user_id } = req.body;
        await yandexService.removeAuthUser(user_id);
        res.redirect(`/calendar/settings?user_id=${user_id}`);
    } catch (error) {
        logger.error(error);
        return res.status(500).send('Internal server error');
    }
});

module.exports = router;
