const moment = require('moment');
const dayOffAPI = require('isdayoff')();
const { CronJob } = require('cron');
const { getReviewTasksByStatus, getNotClosedReviewTasks, getTaskNotifications,
    addTaskNotification, updateReviewTaskStatus } = require('../db/models/reviewTask');
const { postMessageInTreed } = require('../mattermost/utils');
const JiraService = require('../services/jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const logger = require('../logger');

class ReviewManager {
    constructor() {
        this.notificationHourPeriod = 24;
        this.checkTaskStatusCronSchedule = '0 * * * *'; // Каждый час
        this.workHourStart = 5;   // 05:00 UTC
        this.workHourEnd = 16; // 16:00 UTC
    }

    /**
     * Инициализация задач на проверку статуса задач
     */
    init() {
        this.startCheckTaskStatusJob();
        moment.relativeTimeThreshold('h', 24 * 7);
    }

    /**
     * Запуск задачи проверки статуса задач
     */
    startCheckTaskStatusJob() {
        new CronJob(
            this.checkTaskStatusCronSchedule,
            () => this.checkTasksStatus().catch(error =>
                logger.error('Ошибка в задаче проверки статуса задач:', error)
            ), null, true, 'UTC'
        ).start();
    }

    /**
     * Проверка статуса задач
     */
    async checkTasksStatus() {
        await this.actualizeReviewTasks();

        if (await this.isHoliday()) {
            return;
        }

        const nowUtcHour = moment.utc().hour();
        if (nowUtcHour < this.workHourStart || nowUtcHour >= this.workHourEnd) {
            return;
        }

        const tasks = await getReviewTasksByStatus(JiraStatusType.INREVIEW);
        for (const task of tasks) {
            const notifications = await getTaskNotifications(task.id);
            const lastNotification = notifications[0] || null;

            const now = moment();
            const lastStatusUpdatedAt = moment(task.updated_at);
            const lastNotificationCreatedAt = moment(lastNotification.created_at);

            // 1. Выбираем, от какой точки отсчёта считать 24 часа:
            //    если задача обновлялась после последнего уведомления — берём дату обновления,
            //    иначе — время создания последнего уведомления.
            const baseTime = lastNotificationCreatedAt.isAfter(lastStatusUpdatedAt)
                ? lastNotificationCreatedAt
                : lastStatusUpdatedAt;

            // 2. Считаем момент, когда выполняется период в 24 часа от baseTime 
            const nextNotificationTime = baseTime.clone().add(this.notificationHourPeriod, 'hours');

            // 3. Если ещё не было уведомлений или прошло >=24 часов — готовим уведомление
            if (!lastNotification || now.isSameOrAfter(nextNotificationTime)) {
                try {
                    const jiraTask = await JiraService.fetchTask(task.task_key);
                    if (jiraTask.status === JiraStatusType.INREVIEW) {
                        await this.sendNotification(task);
                    }
                    else {
                        await updateReviewTaskStatus({
                            task_key: task.task_key,
                            status: jiraTask.status
                        });
                    }
                } catch (error) {
                    logger.error(`Ошибка при проверке задачи ${task.task_key}:`, error);
                }
            }
        }
    }

    /**
     * Актуализация задач на ревью
     */
    async actualizeReviewTasks() {
        const tasks = await getNotClosedReviewTasks();
        for (const task of tasks) {
            try {
                const jiraTask = await JiraService.fetchTask(task.task_key);
                if (jiraTask.status !== task.status) {
                    await updateReviewTaskStatus({
                        task_key: task.task_key,
                        status: jiraTask.status
                    });
                }
            } catch (error) {
                logger.error(`Ошибка при актуализации задачи ${task.task_key}:`, error);
            }
        }
    }

    /**
     * Отправка уведомления
     */
    async sendNotification(task) {
        const message = `Задача [${task.task_key}](https://jira.parcsis.org/browse/${task.task_key}) переведена в **${JiraStatusType.INREVIEW}** ${moment(task.updated_at).fromNow()}.\n${task.reviewer !== null ? task.reviewer : "@channel"}, пожалуйста, проверьте задачу.`;
        const post = await postMessageInTreed(task.post_id, message);
        if (post) {
            await addTaskNotification(task.id);
        }
    }

    /**
     * Проверка, является ли день выходным
     * @returns {Promise<boolean>}
     */
    async isHoliday() {
        try {
            const isHoliday = await dayOffAPI.today();
            return isHoliday;
        } catch (error) {
            logger.error(`Error in isHoliday: ${error.message}\nStack trace:\n${error.stack}`);
            return false;
        }
    }
}

module.exports = new ReviewManager();