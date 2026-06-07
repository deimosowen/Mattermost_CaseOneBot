const express = require('express');
const { getVisibleMenuItems } = require('../menuRegistry');

const router = express.Router();

router.get('/', (req, res) => {
    const isAdmin = res.locals.user?.isAdmin || false;
    const allowedMenuKeys = res.locals.user?.allowedMenuKeys || [];
    const availablePages = getVisibleMenuItems('main', allowedMenuKeys, { isAdmin });
    const adminPages = getVisibleMenuItems('admin', allowedMenuKeys, { isAdmin });

    res.render('home', {
        availablePages: availablePages,
        isAdmin: isAdmin || adminPages.length > 0,
        adminPages: adminPages
    });
});

router.get('/PrivacyPolicy', (req, res) => {
    res.redirect('https://github.com/deimosowen/Mattermost_CaseOneBot/blob/main/PrivacyPolicy.md');
});

module.exports = router;
