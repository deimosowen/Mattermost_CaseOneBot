const express = require('express');
const { getUserSettings, updateUserSettings } = require('../../db/models/calendars');

const router = express.Router();

router.get('/settings/', async (req, res) => {
    const { user_id } = req.query;
    const settings = await getUserSettings(user_id);
    if (!settings) {
        return res.status(400).send('Bad Request: Not found user.');
    }
    res.render('calendarSettings', {
        user_id: user_id,
        settings: settings,
        success: req.query.success || false
    });
});

router.post('/settings/', async (req, res) => {
    const parameters = req.body;
    const user_id = parameters.user_id;
    parameters.is_notification = parseInt(parameters.is_notification) || 0;
    parameters.dnd_mode = parseInt(parameters.dnd_mode) || 0;
    await updateUserSettings(user_id, parameters);
    res.redirect(`/calendar/settings?user_id=${user_id}&success=true`);
});

module.exports = router;
