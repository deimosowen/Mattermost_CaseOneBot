const BaseCronService = require('./baseCronService');
const ReviewManager = require('../services/reviewService');
const logger = require('../logger');

class ReviewManagerCronService extends BaseCronService {
    constructor() {
        super('ReviewManagerCron');
        this.checkTaskStatusJobKey = 'review_manager_check_task_status';
    }

    async loadJobsFromDb() {
        this.createJob(
            this.checkTaskStatusJobKey,
            ReviewManager.checkTaskStatusCronSchedule,
            async () => {
                try {
                    await ReviewManager.checkTasksStatus();
                } catch (error) {
                    logger.error('Ошибка в задаче проверки статуса задач:', error);
                }
            }
        );
    }
}

module.exports = ReviewManagerCronService;
