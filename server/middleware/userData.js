const packageJson = require('../../package.json');
const { ADMIN_ID } = require('../../config');

/**
 * Middleware для передачи данных пользователя во все шаблоны
 */
function userDataMiddleware(req, res, next) {
    // Передаем информацию о пользователе в шаблоны
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
        const userMattermostId = req.user.mattermostUserId;
        const isAdmin = ADMIN_ID && userMattermostId && userMattermostId === ADMIN_ID;
        
        res.locals.user = {
            id: req.user.id,
            username: req.user.username,
            displayName: req.user.displayName || req.user.username,
            email: req.user.email, // email уже извлечен при сериализации
            photo: req.user.photo, // photo уже извлечен при сериализации
            mattermostUserId: userMattermostId, // ID пользователя в Mattermost
            isAdmin: isAdmin // Флаг администратора
        };
        res.locals.isAuthenticated = true;
    } else {
        res.locals.user = null;
        res.locals.isAuthenticated = false;
    }
    
    // Передаем версию приложения
    res.locals.appVersion = packageJson.version;
    
    next();
}

module.exports = userDataMiddleware;