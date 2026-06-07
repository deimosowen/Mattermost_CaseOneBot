const { CronJob } = require('cron');
const logger = require('../logger');
const cronExecutionTracker = require('./cronExecutionTracker');

class BaseCronService {
    constructor(name, tz = 'UTC') {
        this.name = name;
        this.jobs = {};
        /** Единственное место хранения runner для критичных задач (key -> wrappedCallback). */
        this.criticalRunners = {};
        this.tz = tz;
    }

    /**
     * Создаёт обычную cron-задачу (без отслеживания и retry).
     */
    createJob(key, schedule, callback) {
        try {
            if (this.jobs[key]) {
                this.jobs[key].stop();
            }
            const job = new CronJob(schedule, callback, null, false, this.tz);
            job.start();
            this.jobs[key] = job;
            logger.info(`[${this.name}] Cron job started: ${key} (${schedule})`);
            return job;
        } catch (error) {
            logger.error(`[${this.name}] Cron error: ${error.message}`);
            return null;
        }
    }

    /**
     * Создаёт критичную cron-задачу: выполнение фиксируется в трекере,
     * при сбое или отсутствии запуска watchdog принудительно перезапустит задачу.
     * @param {string} key — уникальный ключ
     * @param {string} schedule — cron-выражение
     * @param {() => Promise<void>} callback — асинхронный колбэк
     * @returns {CronJob|null}
     */
    createCriticalJob(key, schedule, callback) {
        const wrappedCallback = () => {
            cronExecutionTracker.recordStart(key);
            Promise.resolve(callback())
                .then(() => cronExecutionTracker.recordSuccess(key))
                .catch((error) => {
                    cronExecutionTracker.recordFailure(key);
                    logger.error(`[${this.name}] Критичная задача ${key} завершилась с ошибкой: ${error.message}`);
                });
        };

        const job = this.createJob(key, schedule, wrappedCallback);
        if (job) {
            this.criticalRunners[key] = wrappedCallback;
            cronExecutionTracker.registerCriticalJob(key, schedule, { tz: this.tz });
        }
        return job;
    }

    /**
     * Возвращает runner для критичной задачи (для watchdog retry). Единственное место, где хранится callback.
     */
    getCriticalRunner(key) {
        return this.criticalRunners[key];
    }

    stopJob(key) {
        if (this.jobs[key]) {
            this.jobs[key].stop();
            delete this.jobs[key];
            delete this.criticalRunners[key];
            cronExecutionTracker.unregisterCriticalJob(key);
            logger.info(`[${this.name}] Cron job stopped: ${key}`);
        }
    }

    stopAll() {
        Object.keys(this.jobs).forEach((key) => this.stopJob(key));
    }

    // абстрактный метод
    async loadJobsFromDb() {
        throw new Error('loadJobsFromDb() must be implemented');
    }
}

module.exports = BaseCronService;
