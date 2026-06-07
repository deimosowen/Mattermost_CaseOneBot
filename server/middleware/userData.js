const packageJson = require('../../package.json');
const { ADMIN_ID } = require('../../config');
const { syncAuthenticatedUser } = require('../../db/models/accessControl');
const logger = require('../../logger');

/**
 * Middleware для передачи данных пользователя во все шаблоны
 */
async function userDataMiddleware(req, res, next) {
    // Передаем информацию о пользователе в шаблоны
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        const userMattermostId = req.user.mattermostUserId;
        let access = null;

        try {
            access = await syncAuthenticatedUser(req.user);
        } catch (error) {
            logger.error(`Could not sync authenticated user access: ${error.message}`);
        }

        const isAdmin = Boolean(access?.isAdmin || (ADMIN_ID && userMattermostId && userMattermostId === ADMIN_ID));
        
        res.locals.user = {
            id: req.user.id,
            username: req.user.username,
            displayName: req.user.displayName || req.user.username,
            email: req.user.email, // email уже извлечен при сериализации
            photo: req.user.photo, // photo уже извлечен при сериализации
            mattermostUserId: userMattermostId, // ID пользователя в Mattermost
            isAdmin: isAdmin, // Флаг администратора
            isEnabled: access?.isEnabled !== false,
            group: access?.group || null,
            allowedMenuKeys: access?.allowedMenuKeys || []
        };
        res.locals.access = access;
        res.locals.isAuthenticated = true;
    } else {
        res.locals.user = null;
        res.locals.access = null;
        res.locals.isAuthenticated = false;
    }
    
    // Передаем версию приложения
    res.locals.appVersion = packageJson.version;
    
    next();
}

module.exports = userDataMiddleware;
