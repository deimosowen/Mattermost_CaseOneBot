require('dotenv').config();

const moment = require('moment');
require('moment/locale/ru');
const logger = require('./logger');

const { initializeMattermost } = require('./mattermost');
const {
    loadCronJobsFromDb,
    loadDutyCronJobsFromDb,
    startPingCronJob,
    stopAllCronJobs,
} = require('./cron');
const { initializeServer, shutdownServer } = require('./server');
const CalendarManager = require('./services/yandexService/calendar');
const ReviewManager = require('./services/reviewService');
const RedisService = require('./services/redisService');
const runMigrations = require('./db/migrations');

/* ===== Настройки времени ===== */
moment.locale('ru');
process.env.TZ = process.env.TZ || 'UTC';

/* ===== Границы завершения ===== */
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'];
let isShuttingDown = false;

/* ===== Утилиты ===== */
function isPromiseLike(x) {
    return x && typeof x.then === 'function';
}
async function maybeAwait(x) {
    return isPromiseLike(x) ? x : undefined;
}

function validateEnv() {
    const required = [
        'API_BASE_URL',
        'BOT_TOKEN',
        'TEAM_CHANNEL_ID',
        'HOST',
        'PORT',
    ];

    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
        const msg = `Отсутствуют обязательные переменные окружения: ${missing.join(', ')}`;
        logger.error(msg);
        process.exit(1);
    }
}

async function shutdown(exitCode = 0) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('Остановка сервиса…');

    try {
        // Параллельно глушим внешние компоненты
        await Promise.allSettled([
            maybeAwait(stopAllCronJobs && stopAllCronJobs()),
            maybeAwait(shutdownServer && shutdownServer()),
            maybeAwait(RedisService.shutdown()),
        ]);

        logger.info('Сервис остановлен корректно.');
    } catch (e) {
        logger.error('Ошибка при остановке сервиса:', e);
    } finally {
        process.exit(exitCode);
    }
}

/* ===== Глобальные обработчики ошибок ===== */
process.on('unhandledRejection', (reason, p) => {
    logger.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    shutdown(1).catch(() => process.exit(1));
});

SHUTDOWN_SIGNALS.forEach((sig) =>
    process.on(sig, () => {
        logger.info(`Получен сигнал ${sig}`);
        shutdown(0);
    })
);

/* ===== Основной запуск ===== */
async function main() {
    logger.info('Старт сервиса…');
    validateEnv();

    // Миграции
    logger.info('Запуск миграций…');
    await runMigrations();
    logger.info('Миграции выполнены.');

    // Redis
    logger.info('Инициализация Redis…');
    RedisService.init();

    // Mattermost
    logger.info('Инициализация Mattermost…');
    initializeMattermost();
    logger.info('Mattermost инициализирован.');

    // Cron-задачи из БД
    logger.info('Загрузка cron-задач…');
    await Promise.all([
        maybeAwait(loadCronJobsFromDb().catch((e) => logger.error('loadCronJobsFromDb:', e))),
        maybeAwait(loadDutyCronJobsFromDb().catch((e) => logger.error('loadDutyCronJobsFromDb:', e))),
    ]);
    logger.info('Cron-задачи загружены.');

    // HTTP/WS-сервер
    logger.info('Инициализация сервера…');
    await maybeAwait(initializeServer());
    logger.info('Сервер инициализирован.');

    // Сервисы домена
    CalendarManager.init();
    ReviewManager.init();
    startPingCronJob();

    logger.info('Бот успешно запущен.');
}

// Запускаем и отлавливаем фатальные ошибки старта
main().catch((err) => {
    logger.error('Ошибка при запуске:', err);
    process.exit(1);
});