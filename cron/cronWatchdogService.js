/**
 * Watchdog для критичных cron-задач: периодически проверяет, что задачи по расписанию
 * выполнились успешно; если нет — принудительно запускает их один раз.
 * Runner берёт из CronManager (единственное место хранения — сервисы).
 */
const cronExecutionTracker = require('./cronExecutionTracker');
const logger = require('../logger');
const config = require('../config');

const CHECK_INTERVAL_MS = config.CRON_WATCHDOG_INTERVAL_MS;
const TOLERANCE_MS = config.CRON_WATCHDOG_TOLERANCE_MS;

function getCronManager() {
    return require('./cronManager');
}

class CronWatchdogService {
    constructor() {
        this.intervalId = null;
    }

    start() {
        if (this.intervalId) {
            return;
        }
        this.intervalId = setInterval(() => this._checkAndRetry(), CHECK_INTERVAL_MS);
        logger.info(
            `[CronWatchdog] Запущен: проверка каждые ${CHECK_INTERVAL_MS / 1000} с, допуск ${TOLERANCE_MS / 1000} с`
        );
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('[CronWatchdog] Остановлен');
        }
    }

    async _checkAndRetry() {
        const toRetry = await cronExecutionTracker.getJobsNeedingRetry({ toleranceMs: TOLERANCE_MS });
        if (toRetry.length === 0) return;

        logger.warn(`[CronWatchdog] Принудительный запуск ${toRetry.length} задач без зафиксированного успеха`);

        const cronManager = getCronManager();
        for (const { key, lastExpectedRun } of toRetry) {
            const runner = cronManager.getRunnerForKey(key);
            if (!runner) {
                logger.warn(`[CronWatchdog] Runner не найден для задачи ${key}, пропуск`);
                continue;
            }
            try {
                logger.info(`[CronWatchdog] Запуск задачи ${key} (ожидалось выполнение после ${lastExpectedRun.toISOString()})`);
                runner();
            } catch (error) {
                logger.error(`[CronWatchdog] Ошибка при принудительном запуске ${key}: ${error.message}`);
            }
        }
    }
}

module.exports = new CronWatchdogService();
