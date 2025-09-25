const { CronJob } = require('cron');
const logger = require('../logger');

class BaseCronService {
    constructor(name, tz = 'UTC') {
        this.name = name;
        this.jobs = {};
        this.tz = tz;
    }

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

    stopJob(key) {
        if (this.jobs[key]) {
            this.jobs[key].stop();
            delete this.jobs[key];
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
