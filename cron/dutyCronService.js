const BaseCronService = require('./baseCronService');
const { getDutySchedules } = require('../db/models/duty');
const { createDutyCallback } = require('../services/dutyService');
const logger = require('../logger');

class DutyCronService extends BaseCronService {
    constructor() {
        super('DutyCron');
        this.prefix = 'duty_';
    }

    async loadJobsFromDb() {
        const dutySchedules = await getDutySchedules();
        for (const duty of dutySchedules) {
            const callback = createDutyCallback(duty.channel_id, duty.use_working_days || false);
            this.createCriticalJob(`${this.prefix}${duty.id}`, duty.cron_schedule, callback);
        }
    }

    addJob(duty) {
        if (!duty.cron_schedule) {
            logger.error(`[${this.name}] Cannot create job: cron_schedule is missing for duty ${duty.id}`);
            return null;
        }
        const callback = createDutyCallback(duty.channel_id, duty.use_working_days || false);
        return this.createCriticalJob(`${this.prefix}${duty.id}`, duty.cron_schedule, callback);
    }

    removeJob(id) {
        return this.stopJob(this.prefix + id);
    }
}

module.exports = DutyCronService;
