const BaseCronService = require('./baseCronService');
const messageDeliveryService = require('../services/messageDeliveryService');
const config = require('../config');
const logger = require('../logger');

class ScheduledMessageCronService extends BaseCronService {
    constructor() {
        super('ScheduledMessageCron');
        this.schedule = config.MESSAGE_DELIVERY_CRON_SCHEDULE;
    }

    async loadJobsFromDb() {
        this.createJob('scheduled_message_delivery', this.schedule, async () => {
            try {
                const processed = await messageDeliveryService.processDueMessages();
                if (processed > 0) {
                    logger.info(`[ScheduledMessageCron] Processed ${processed} scheduled messages`);
                }
            } catch (error) {
                logger.error(`[ScheduledMessageCron] Error processing scheduled messages: ${error.message}`);
            }
        });
    }
}

module.exports = ScheduledMessageCronService;
