const BaseCronService = require('./baseCronService');
const { getWorklogReportSettings } = require('../db/models/worklogReportSettings');
const worklogReportService = require('../services/worklogReportService');
const logger = require('../logger');

class WorklogReportCronService extends BaseCronService {
    constructor() {
        super('WorklogReportCron');
        this.prefix = 'worklog_report_';
    }

    async loadJobsFromDb() {
        const settings = await getWorklogReportSettings({ includeDisabled: false });
        for (const setting of settings) {
            this.addJob(setting);
        }
    }

    addJob(setting) {
        if (!Number(setting.is_enabled)) {
            return null;
        }

        const callback = async () => {
            try {
                await worklogReportService.sendConfiguredReport(setting);
            } catch (error) {
                logger.error(`[WorklogReportCron] Report task error (id=${setting.id}): ${error.message}`);
            }
        };

        return this.createJob(`${this.prefix}${setting.id}`, setting.cron_schedule, callback);
    }

    refreshJob(setting) {
        this.removeJob(setting.id);
        return this.addJob(setting);
    }

    removeJob(id) {
        return this.stopJob(this.prefix + id);
    }
}

module.exports = WorklogReportCronService;
