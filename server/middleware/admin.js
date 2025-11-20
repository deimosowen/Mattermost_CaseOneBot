const { ADMIN_ID } = require('../../config');
const logger = require('../../logger');

/**
 * Middleware для проверки прав администратора
 */
function requireAdmin(req, res, next) {
    if (!ADMIN_ID) {
        logger.warn('ADMIN_ID not configured');
        return res.status(403).json({ error: 'Admin access not configured' });
    }

    // Проверяем Mattermost user ID из сессии
    const userMattermostId = req.user?.mattermostUserId;
    
    if (!userMattermostId) {
        return res.status(403).json({ error: 'User Mattermost ID not found' });
    }

    if (userMattermostId !== ADMIN_ID) {
        logger.warn(`Unauthorized admin access attempt by user ${userMattermostId}`);
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    next();
}

module.exports = requireAdmin;

