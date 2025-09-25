const GitlabCronService = require('./gitlabCronService');
const DutyCronService = require('./dutyCronService');
const ReminderCronService = require('./reminderCronService');
const PingCronService = require('./pingCronService');
const logger = require('../logger');

class CronManager {
    constructor() {
        this.services = {};
        this._register(new ReminderCronService());
        this._register(new GitlabCronService());
        this._register(new DutyCronService());
        this._register(new PingCronService());
    }

    get(name) {
        return this.services[name];
    }

    async startAll() {
        for (const service of Object.values(this.services)) {
            try {
                await service.loadJobsFromDb();
            } catch (error) {
                logger.error(`[CronManager] Ошибка запуска ${service.name}: ${error.message}`);
            }
        }
    }

    stopAll() {
        Object.values(this.services).forEach((s) => s.stopAll());
    }

    _register(service) {
        this.services[service.name] = service;
    }
}

module.exports = new CronManager();
