const express = require('express');
const http = require('http');
const path = require('path');
const logger = require('../logger');

const homeController = require('./controllers/homeController');
const oauthController = require('./controllers/oauthController');
const calendarController = require('./controllers/calendarController');
const dutyController = require('./controllers/dutyController');
const inviteController = require('./controllers/inviteController');
const jiraController = require('./controllers/jiraController');

let app;
let server;

function buildApp() {
    const app = express();

    // Базовые мидлвары
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Шаблоны и статика
    app.engine('ejs', require('ejs-locals'));
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    app.use(express.static('public'));

    // Маршруты
    app.use('/', homeController);
    app.use('/oauth', oauthController);
    app.use('/calendar', calendarController);
    app.use('/duty', dutyController);
    app.use('/invite', inviteController);
    app.use('/jira', jiraController);

    // healthcheck для оркестраторов / мониторинга
    app.get('/healthz', (_req, res) => res.status(200).send('ok'));

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
