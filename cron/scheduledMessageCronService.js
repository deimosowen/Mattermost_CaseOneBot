const BaseCronService = require('./baseCronService');
const scheduledMessageDispatcher = require('../services/scheduledMessageDispatcher');
const config = require('../config');
const logger = require('../logger');
const cronValidator = require('cron-validator');

const DEFAULT_MESSAGE_DELIVERY_CRON_SCHEDULE = '* * * * *';

const normalizeSchedule = (schedule) => String(schedule || '').trim().replace(/\s+/g, ' ');

class ScheduledMessageCronService extends BaseCronService {
    constructor() {
        super('ScheduledMessageCron');
        this.schedule = this.resolveSchedule(config.MESSAGE_DELIVERY_CRON_SCHEDULE);
    }

    async loadJobsFromDb() {
        this.createJob('scheduled_message_delivery', this.schedule, async () => {
            try {
                const processed = await scheduledMessageDispatcher.processDueMessages();
                if (processed > 0) {
                    logger.info(`[ScheduledMessageCron] Processed ${processed} scheduled messages`);
                }
            } catch (error) {
                logger.error(`[ScheduledMessageCron] Error processing scheduled messages: ${error.message}`);
            }
        });
    }

    resolveSchedule(schedule) {
        const normalizedSchedule = normalizeSchedule(schedule);
        if (cronValidator.isValidCron(normalizedSchedule, { seconds: true })) {
            return normalizedSchedule;
        }

        logger.warn(
            `[ScheduledMessageCron] Invalid MESSAGE_DELIVERY_CRON_SCHEDULE="${schedule}", using default "${DEFAULT_MESSAGE_DELIVERY_CRON_SCHEDULE}"`
        );
        return DEFAULT_MESSAGE_DELIVERY_CRON_SCHEDULE;
    }
}

module.exports = ScheduledMessageCronService;
