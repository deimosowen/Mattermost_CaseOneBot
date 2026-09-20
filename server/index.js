const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const homeController = require('./controllers/homeController');
const authController = require('./controllers/authController');
const oauthController = require('./controllers/oauthController');
const calendarController = require('./controllers/calendarController');
const dutyController = require('./controllers/dutyController');
const inviteController = require('./controllers/inviteController');
const forwardController = require('./controllers/forwardController');
const jiraController = require('./controllers/jiraController');
const featureController = require('./controllers/featureController');
const patchController = require('./controllers/patchController');
const gitlabController = require('./controllers/gitlabController');
const teamcityController = require('./controllers/teamcityController');
const reviewController = require('./controllers/reviewController');
const adminController = require('./controllers/adminController');
const reminderController = require('./controllers/reminderController');
const commandsController = require('./controllers/commandsController');
const profileController = require('./controllers/profileController');
const worklogReportController = require('./controllers/worklogReportController');

const passport = require('./middleware/passport');
const requireAuth = require('./middleware/auth');
const userDataMiddleware = require('./middleware/userData');
const menuAccessMiddleware = require('./middleware/menuAccess');

const logger = require('../logger');

let app;
let server;

function buildApp() {
    const app = express();

    // Базовые мидлвары
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Настройка сессий с SQLite
    app.use(session({
        store: new SQLiteStore({
            db: 'sessions.db',
            dir: path.join(__dirname, '../db')
        }),
        secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false,
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
        }
    }));

    // Инициализация Passport
    app.use(passport.initialize());
    app.use(passport.session());

    // Middleware для передачи данных пользователя в шаблоны
    app.use(userDataMiddleware);

    // Шаблоны и статика
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');

    // Настройка ejs-locals с явной передачей настроек
    const ejsLocals = require('ejs-locals');
    app.engine('ejs', function (file, options, callback) {
        // Убеждаемся, что options.settings существует
        if (!options.settings) {
            options.settings = {};
        }
        // Копируем настройки из app.settings, если они доступны
        if (options.settings && app.settings) {
            Object.keys(app.settings).forEach(key => {
                if (!options.settings[key]) {
                    options.settings[key] = app.settings[key];
                }
            });
        }
        // Вызываем оригинальный ejs-locals
        return ejsLocals(file, options, callback);
    });
    app.use(express.static('public'));

    // Публичные маршруты (до авторизации)
    app.get('/healthz', (_req, res) => res.status(200).send('ok'));
    app.use('/auth', authController);
    app.use('/oauth', oauthController);

    // Middleware авторизации с исключениями
    const publicPaths = [
        '/',
        '/healthz',
        '/auth/yandex', // Инициация авторизации
        '/auth/error', // Страница ошибки авторизации
        '/auth/logout', // Выход (доступен всем)
        '/oauth/yandexAuthCallback',
        '/calendar/auth', // POST для сохранения токенов Яндекс календаря
        '/gitlab/webhook',
        '/jira/api/tasks', // использует свой Authorization header
        '/jira/api/review', // может использовать свою авторизацию
    ];

    const publicPatterns = [
        '^/api/public/.*', // если будут публичные API
    ];

    const isPublicPath = (path) => {
        const exactOrWildcard = publicPaths.some(publicPath => {
            if (path === publicPath) return true;
            if (publicPath.endsWith('*') && path.startsWith(publicPath.slice(0, -1))) return true;
            return false;
        });

        if (exactOrWildcard) {
            return true;
        }

        return publicPatterns.some(pattern => new RegExp(pattern).test(path));
    };

    app.use(requireAuth(publicPaths, publicPatterns));
    app.use((req, res, next) => {
        if (isPublicPath(req.path)) {
            return next();
        }

        return menuAccessMiddleware(req, res, next);
    });

    // Защищенные маршруты
    app.use('/', homeController);
    app.use('/calendar', calendarController);
    app.use('/duty', dutyController);
    app.use('/invite', inviteController);
    app.use('/forward', forwardController);
    app.use('/jira', jiraController);
    app.use('/feature', featureController);
    app.use('/patch', patchController);
    app.use('/gitlab', gitlabController);
    app.use('/teamcity', teamcityController);
    app.use('/review', reviewController);
    app.use('/admin', adminController);
    app.use('/reminders', reminderController);
    app.use('/commands', commandsController);
    app.use('/profile', profileController);
    app.use('/worklogs', worklogReportController);

    return app;
}

/**
 * Инициализация HTTP-сервера.
 * Возвращает Promise, резолвящийся после начала прослушивания порта.
 * Если вызывающая сторона не ждёт промис — тоже ок (совместимо с текущим кодом).
 */
async function initializeServer(port = process.env.PORT) {
    if (!app) app = buildApp();

    // Порт по умолчанию
    if (!port) {
        port = 3000;
        logger?.warn?.('PORT не задан, использую 3000');
    }

    // Уже запущен — ничего не делаем
    if (server?.listening) {
        logger?.info?.('Сервер уже запущен, повторная инициализация пропущена');
        return server;
    }

    server = http.createServer(app);

    // Чтобы корректно логировать ошибки на сокете до listen
    server.on('error', (err) => {
        logger?.error?.('Server error:', err);
    });

    await new Promise((resolve, reject) => {
        server.listen(port, () => {
            resolve();
        });
        server.once('error', reject);
    });

    return server;
}

/**
 * Корректная остановка сервера.
 * Закрывает входящие соединения и перестаёт принимать новые.
 * Без броска исключений при повторном вызове.
 */
async function shutdownServer({ timeoutMs = 5000 } = {}) {
    if (!server) return;

    // Если уже закрывается/закрыт
    if (!server.listening) return;

    // Оборачиваем server.close в Promise
    const closePromise = new Promise((resolve) => {
        server.close((err) => {
            if (err) {
                logger?.error?.('Ошибка при закрытии сервера:', err);
            } else {
                logger?.info?.('HTTP-сервер остановлен.');
            }
            resolve();
        });
    });

    // Таймаут на всякий случай, чтобы не зависнуть
    const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => {
            logger?.warn?.('shutdownServer: превышен таймаут закрытия, завершаю принудительно');
            resolve();
        }, timeoutMs)
    );

    await Promise.race([closePromise, timeoutPromise]);
}

function getApp() {
    if (!app) app = buildApp();
    return app;
}

module.exports = {
    initializeServer,
    shutdownServer,
    getApp,
};
