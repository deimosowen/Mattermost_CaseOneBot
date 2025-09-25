const BaseCronService = require('./baseCronService');
const { getReminders } = require('../db/models/reminders');
const ReminderService = require('../services/reminderService');
const TaskType = require('../types/taskTypes');
const logger = require('../logger');

class ReminderCronService extends BaseCronService {
    constructor() {
        super('ReminderCron');
        this.reminderService = new ReminderService();
        this.prefix = 'reminder_';
    }

    async loadJobsFromDb() {
        const reminders = await getReminders();
        for (const reminder of reminders) {
            const callback = async () => {
                try {
                    if (await this.reminderService.shouldSend(reminder.use_working_days)) {
                        await this.reminderService.sendReminder(reminder);
                    }
                } catch (error) {
                    logger.error(
                        `[ReminderCron] Reminder task error (id=${reminder.id}): ${error.message}`
                    );
                }
            };

            this.createJob(`${this.prefix}${reminder.id}`, reminder.schedule, callback, TaskType.REMINDER);
        }
    }

    addJob(reminder) {
        const callback = async () => {
            try {
                if (await this.reminderService.shouldSend(reminder.use_working_days)) {
                    await this.reminderService.sendReminder(reminder);
                }
            } catch (error) {
                logger.error(`[ReminderCron] Reminder task error (id=${reminder.id}): ${error.message}`);
            }
        };

        return this.createJob(
            `${this.prefix}${reminder.id}`,
            reminder.schedule,
            callback
        );
    }

    removeJob(id) {
        return this.stopJob(this.prefix + id);
    }
}

module.exports = ReminderCronService;
