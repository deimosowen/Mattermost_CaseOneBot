const BaseCronService = require('./baseCronService');
const { getDutySchedules } = require('../db/models/duty');
const { createDutyCallback } = require('../services/dutyService');

class DutyCronService extends BaseCronService {
    constructor() {
        super('DutyCron');
        this.prefix = 'duty_';
    }

    async loadJobsFromDb() {
        const dutySchedules = await getDutySchedules();
        for (const duty of dutySchedules) {
            const callback = createDutyCallback(duty.channel_id, duty.use_working_days);
            this.createJob(`${this.prefix}${duty.id}`, duty.cron_schedule, callback);
        }
    }

    addJob(duty) {
        const callback = createDutyCallback(duty.channel_id, duty.use_working_days);
        return this.createJob(`${this.prefix}${duty.id}`, duty.cron_schedule, callback);
    }

    removeJob(id) {
        return this.stopJob(this.prefix + id);
    }
}

module.exports = DutyCronService;
