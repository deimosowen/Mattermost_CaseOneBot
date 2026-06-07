const { getMenuKeyForPath } = require('../menuRegistry');
const { getAccessForUser } = require('../../db/models/accessControl');
const logger = require('../../logger');

function sendForbidden(req, res, message) {
    if (req.path.startsWith('/api/') || req.headers['content-type']?.includes('application/json')) {
        return res.status(403).json({ error: message });
    }

    return res.status(403).send(message);
}

async function menuAccess(req, res, next) {
    const menuKey = getMenuKeyForPath(req.path);
    if (!menuKey) {
        return next();
    }

    const mattermostUserId = req.user?.mattermostUserId;
    if (!mattermostUserId) {
        return sendForbidden(req, res, 'User Mattermost ID not found');
    }

    const access = res.locals.access || await getAccessForUser(mattermostUserId);
    if (access?.isEnabled === false) {
        logger.warn(`Disabled user ${mattermostUserId} tried to access ${req.path}`);
        return sendForbidden(req, res, 'Доступ отключен администратором');
    }

    const allowedMenuKeys = new Set(access?.allowedMenuKeys || []);
    if (access?.isAdmin || allowedMenuKeys.has(menuKey)) {
        return next();
    }

    logger.warn(`User ${mattermostUserId} has no menu access for ${menuKey} (${req.path})`);
    return sendForbidden(req, res, 'Нет доступа к этому разделу');
}

module.exports = menuAccess;
