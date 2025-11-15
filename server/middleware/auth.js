const logger = require('../../logger');

/**
 * Создает middleware для проверки авторизации с поддержкой исключений
 * @param {Array<string>} publicPaths - Массив путей, которые не требуют авторизации
 * @param {Array<string>} publicPatterns - Массив паттернов (regex) для путей без авторизации
 * @returns {Function} Express middleware
 */
function requireAuth(publicPaths = [], publicPatterns = []) {
    return (req, res, next) => {
        // Проверяем, является ли путь публичным
        const isPublicPath = publicPaths.some(path => {
            // Точное совпадение
            if (req.path === path) return true;
            // Проверка начала пути (для вложенных маршрутов)
            if (path.endsWith('*') && req.path.startsWith(path.slice(0, -1))) return true;
            return false;
        });

        // Проверяем паттерны
        const matchesPattern = publicPatterns.some(pattern => {
            const regex = new RegExp(pattern);
            return regex.test(req.path);
        });

        // Если путь публичный - пропускаем
        if (isPublicPath || matchesPattern) {
            return next();
        }

        // Проверяем авторизацию
        if (req.isAuthenticated && req.isAuthenticated()) {
            return next();
        }

        // Для API запросов возвращаем 401
        if (req.path.startsWith('/api/') || req.headers['content-type']?.includes('application/json')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Для UI запросов редиректим на home страницу
        // Пользователь увидит информацию и сможет сам нажать кнопку входа
        return res.redirect('/');
    };
}

module.exports = requireAuth;