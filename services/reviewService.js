const moment = require('moment');
const dayOffAPI = require('isdayoff')();
const { CronJob } = require('cron');
const {
    getReviewTasksByStatus,
    getNotClosedReviewTasks,
    getTaskNotifications,
    addTaskNotification,
    updateReviewTaskStatus
} = require('../db/models/reviewTask');
const { postMessageInTreed, getUserByUsername } = require('../mattermost/utils');
const reviewCommand = require('../commands/review');
const JiraService = require('../services/jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const logger = require('../logger');

class ReviewManager {
    constructor() {
        // Час ежедневного напоминания (UTC). После этого времени — «окно» доставки за сегодня.
        this.dailyNotificationHourUtc = 5; // 05:00 UTC

        // Крон оставляем ежечасно — это и авто-актуализация, и «догон» уведомлений,
        // если 05:00 было пропущено.
        this.checkTaskStatusCronSchedule = '0 * * * *'; // Каждый час, на 00 минуте
    }

    init() {
        this.startCheckTaskStatusJob();
        moment.relativeTimeThreshold('h', 24 * 7);
    }

    startCheckTaskStatusJob() {
        new CronJob(
            this.checkTaskStatusCronSchedule,
            () => this.checkTasksStatus().catch(error =>
                logger.error('Ошибка в задаче проверки статуса задач:', error)
            ),
            null,
            true,
            'UTC'
        ).start();
    }

    /**
     * Ежечасная проверка:
     *  - всегда актуализируем статусы
     *  - если сегодня рабочий день и текущее время >= 05:00 UTC,
     *    отправляем "ежедневное" уведомление по задачам, у которых его ещё нет.
     */
    async checkTasksStatus() {
        // 1) Актуализируем статусы (ежечасно)
        await this.actualizeReviewTasks();

        // 2) В выходные/праздники — не уведомляем
        if (await this.isHoliday()) return;

        const nowUtc = moment.utc();
        const todayStartUtc = nowUtc.clone().startOf('day');
        const notifyWindowStartUtc = todayStartUtc.clone().hour(this.dailyNotificationHourUtc);

        // 3) До 05:00 UTC сегодня — ещё рано для "ежедневных" уведомлений
        if (nowUtc.isBefore(notifyWindowStartUtc)) return;

        // 4) Ищем задачи в IN REVIEW и проверяем, что "уведомления за сегодня" ещё не было
        const tasks = await getReviewTasksByStatus(JiraStatusType.INREVIEW);

        for (const task of tasks) {
            try {
                // Проверяем, было ли уже уведомление сегодня
                const notifications = await getTaskNotifications(task.id);
                const lastNotification = (notifications || [])
                    .sort((a, b) => moment.utc(b.created_at).diff(moment.utc(a.created_at)))[0] || null;

                if (lastNotification && moment.utc(lastNotification.created_at).isSame(nowUtc, 'day')) {
                    continue; // за сегодня уже уведомляли
                }

                // Уведомляем только задачи, переведённые в IN REVIEW до начала текущего дня
                const lastStatusUpdatedAtUtc = moment.utc(task.updated_at);
                if (lastStatusUpdatedAtUtc.isSameOrAfter(todayStartUtc)) {
                    continue; // перевели сегодня — уведомим завтра (после 05:00 UTC)
                }

                // Актуальный статус в Jira на момент отправки
                const jiraTask = await JiraService.fetchTask(task.task_key);
                if (jiraTask.status === JiraStatusType.INREVIEW) {
                    await this.sendNotification(task);
                } else {
                    await updateReviewTaskStatus({
                        task_key: task.task_key,
                        status: jiraTask.status
                    });
                }
            } catch (error) {
                logger.error(`Ошибка при обработке задачи ${task.task_key}:`, error);
            }
        }
    }

    /**
     * Актуализация статусов задач на ревью (ежечасно)
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
        const message =
            `Задача [${task.task_key}](https://jira.parcsis.org/browse/${task.task_key}) ` +
            `переведена в **${JiraStatusType.INREVIEW}** ${moment.utc(task.updated_at).fromNow()}.\n` +
            `${task.reviewer !== null ? task.reviewer : "@channel"}, пожалуйста, проверьте задачу.`;

        const post = await postMessageInTreed(task.post_id, message);
        if (post) {
            await addTaskNotification(task.id);
        }
    }

    /**
     * Обработка команды ревью  
     * @param {Object} params - Параметры команды
     * @param {string} params.taskKey - Ключ задачи в формате "YYY-XXXXX"
     * @param {string} params.userName - Имя пользователя Mattermost, который инициировал команду
     */
    async handleReviewCommand({ taskKey, userName }) {
        try {
            const user = await getUserByUsername(userName);
            if (user) {
                await reviewCommand({
                    post_id: null,
                    user_id: user.id,
                    user_name: user.username,
                    args: [taskKey, null, null]
                });
            }
        } catch (error) {
            logger.error(error);
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