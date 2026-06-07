const { ADMIN_ID } = require('../../config');
const logger = require('../../logger');
const { getAccessForUser } = require('../../db/models/accessControl');

/**
 * Middleware для проверки прав администратора
 */
async function requireAdmin(req, res, next) {
    // Проверяем Mattermost user ID из сессии
    const userMattermostId = req.user?.mattermostUserId;
    
    if (!userMattermostId) {
        return res.status(403).json({ error: 'User Mattermost ID not found' });
    }

    const isConfiguredAdmin = Boolean(ADMIN_ID && userMattermostId === ADMIN_ID);
    const access = res.locals.access || await getAccessForUser(userMattermostId);
    const isGroupAdmin = Boolean(access?.isAdmin);

    if (!isConfiguredAdmin && access?.isEnabled === false) {
        logger.warn(`Disabled admin access attempt by user ${userMattermostId}`);
        return res.status(403).json({ error: 'Forbidden: User disabled' });
    }

    if (!isConfiguredAdmin && !isGroupAdmin) {
        logger.warn(`Unauthorized admin access attempt by user ${userMattermostId}`);
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    next();
}

module.exports = requireAdmin;

