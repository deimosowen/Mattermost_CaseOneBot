const ReviewCronService = require('./reviewCronService');
const DutyCronService = require('./dutyCronService');
const ReminderCronService = require('./reminderCronService');
const PingCronService = require('./pingCronService');
const FeatureReadyCronService = require('./featureReadyCronService');
const TeamCityBuildCronService = require('./teamcityBuildCronService');
const ScheduledMessageCronService = require('./scheduledMessageCronService');
const cronWatchdogService = require('./cronWatchdogService');
const logger = require('../logger');

class CronManager {
    constructor() {
        this.services = {};
        this._register(new ReminderCronService());
        this._register(new ReviewCronService());
        this._register(new DutyCronService());
        this._register(new PingCronService());
        this._register(new FeatureReadyCronService());
        this._register(new TeamCityBuildCronService());
        this._register(new ScheduledMessageCronService());
    }

    get(name) {
        return this.services[name];
    }

    /**
     * Возвращает runner (callback) для критичной задачи по ключу.
     * Единственное место запуска по ключу — сервисы хранят runner.
     */
    getRunnerForKey(key) {
        for (const service of Object.values(this.services)) {
            if (service.getCriticalRunner) {
                const runner = service.getCriticalRunner(key);
                if (runner) return runner;
            }
        }
        return null;
    }

    async startAll() {
        for (const service of Object.values(this.services)) {
            try {
                await service.loadJobsFromDb();
            } catch (error) {
                logger.error(`[CronManager] Ошибка запуска ${service.name}: ${error.message}`);
            }
        }
        cronWatchdogService.start();
    }

    stopAll() {
        cronWatchdogService.stop();
        Object.values(this.services).forEach((s) => s.stopAll());
    }

    _register(service) {
        this.services[service.name] = service;
    }
}

module.exports = new CronManager();
