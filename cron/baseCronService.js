const { CronJob } = require('cron');
const logger = require('../logger');
const cronExecutionTracker = require('./cronExecutionTracker');

class BaseCronService {
    constructor(name, tz = 'UTC') {
        this.name = name;
        this.jobs = {};
        this.runners = {};
        this.runningJobs = new Set();
        /** Единственное место хранения runner для критичных задач (key -> wrappedCallback). */
        this.criticalRunners = {};
        this.tz = tz;
    }

    /**
     * Создаёт обычную cron-задачу (без отслеживания и retry).
     */
    createJob(key, schedule, callback, options = {}) {
        try {
            if (this.jobs[key]) {
                this.jobs[key].stop();
            }
            const wrappedCallback = this._wrapCallback(key, callback, options);
            const job = new CronJob(schedule, wrappedCallback, null, false, this.tz);
            job.start();
            this.jobs[key] = job;
            this.runners[key] = wrappedCallback;
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
    createCriticalJob(key, schedule, callback, options = {}) {
        const wrappedCallback = () => {
            cronExecutionTracker.recordStart(key);
            return Promise.resolve(callback())
                .then(() => cronExecutionTracker.recordSuccess(key))
                .catch((error) => {
                    cronExecutionTracker.recordFailure(key);
                    logger.error(`[${this.name}] Критичная задача ${key} завершилась с ошибкой: ${error.message}`);
                });
        };

        const job = this.createJob(key, schedule, wrappedCallback, options);
        if (job) {
            this.criticalRunners[key] = this.runners[key];
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
            delete this.runners[key];
            delete this.criticalRunners[key];
            this.runningJobs.delete(key);
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

    _wrapCallback(key, callback, options = {}) {
        const noOverlap = options.noOverlap !== false;
        if (!noOverlap) {
            return callback;
        }

        return async () => {
            if (this.runningJobs.has(key)) {
                logger.warn(`[${this.name}] Cron job skipped because previous run is still active: ${key}`);
                return;
            }

            this.runningJobs.add(key);
            try {
                return await callback();
            } finally {
                this.runningJobs.delete(key);
            }
        };
    }
}

module.exports = BaseCronService;
