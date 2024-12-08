const express = require('express');
const { updateUser } = require('../../db/models/calendars');

const router = express.Router();

router.get('/', (req, res) => {
    res.redirect('https://github.com/deimosowen/Mattermost_CaseOneBot');
});

router.get('/PrivacyPolicy', (req, res) => {
    res.redirect('https://github.com/deimosowen/Mattermost_CaseOneBot/blob/main/PrivacyPolicy.md');
});

module.exports = router;