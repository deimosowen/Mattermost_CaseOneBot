const BaseCronService = require('./baseCronService');
const CalendarManager = require('../services/yandexService/calendar');
const logger = require('../logger');

class CalendarCronService extends BaseCronService {
    constructor() {
        super('CalendarCron');
        this.notificationJobKey = 'calendar_notifications';
        this.cleanupJobKey = 'calendar_cleanup';
    }

    async loadJobsFromDb() {
        this.createJob(
            this.notificationJobKey,
            CalendarManager.notificationCronSchedule,
            async () => {
                try {
                    await CalendarManager.notifyAllUsers();
                } catch (error) {
                    logger.error('Ошибка в задаче уведомлений:', error);
                }
            }
        );

        this.createJob(
            this.cleanupJobKey,
            CalendarManager.cleanupCronSchedule,
            async () => {
                try {
                    await CalendarManager.cleanupNotifiedEvents();
                } catch (error) {
                    logger.error('Ошибка в задаче очистки:', error);
                }
            }
        );
    }
}

module.exports = CalendarCronService;
