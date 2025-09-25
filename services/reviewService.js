const moment = require('moment');
const dayOffAPI = require('isdayoff')();
const { CronJob } = require('cron');

const {
    getReviewTasksByStatus,
    getNotClosedReviewTasks,
    getTaskNotifications,
    addTaskNotification,
    updateReviewTaskStatus,
} = require('../db/models/reviewTask');

const { postMessageInTreed, getUserByEmail } = require('../mattermost/utils');
const reviewCommand = require('../commands/review');
const JiraService = require('../services/jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const logger = require('../logger');

/** Константы расписания */
const DAILY_NOTIFICATION_HOUR_UTC = 5;     // 05:00 UTC
const CHECK_TASK_STATUS_CRON = '0 * * * *'; // Каждый час, на 00 минуте

/** Утилиты времени */
const nowUtc = () => moment.utc();
const startOfTodayUtc = () => nowUtc().clone().startOf('day');

/**
 * Возвращает самый свежий notification или null.
 * @param {Array<{created_at:string}>} notifications
 */
function getLastNotification(notifications) {
    if (!Array.isArray(notifications) || notifications.length === 0) {
        return null;
    }

    const sorted = notifications.slice().sort((a, b) =>
        moment.utc(b.created_at).diff(moment.utc(a.created_at))
    );
    return sorted[0];
}

/**
 * Нужно ли сегодня слать уведомление по задаче.
 * Условия (логика не менялась):
 *  - уже после 05:00 UTC сегодняшнего дня;
 *  - сегодня ещё не уведомляли;
 *  - задача в IN REVIEW с «вчера и ранее» (updated_at < начало сегодняшнего дня).
 */
function shouldNotifyToday({ lastNotifUtc, taskUpdatedUtc, nowUtcObj, todayStartUtc, notifyWindowStartUtc }) {
    if (nowUtcObj.isBefore(notifyWindowStartUtc)) return false;
    if (lastNotifUtc && lastNotifUtc.isSame(nowUtcObj, 'day')) return false;
    if (taskUpdatedUtc.isSameOrAfter(todayStartUtc)) return false;
    return true;
}

class ReviewManager {
    constructor() {
        /** Час ежедневного напоминания (UTC). После этого времени — «окно» доставки за сегодня. */
        this.dailyNotificationHourUtc = DAILY_NOTIFICATION_HOUR_UTC;
        /** Ежечасный крон: авто-актуализация и «догон» уведомлений, если 05:00 пропущено. */
        this.checkTaskStatusCronSchedule = CHECK_TASK_STATUS_CRON;
    }

    /** Инициализация задач */
    init() {
        this.startCheckTaskStatusJob();
        moment.relativeTimeThreshold('h', 24 * 7);
    }

    /** Запуск задачи проверки статусов */
    startCheckTaskStatusJob() {
        new CronJob(
            this.checkTaskStatusCronSchedule,
            () =>
                this.checkTasksStatus().catch((error) =>
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
     *    отправляем «ежедневное» уведомление по задачам, у которых его ещё нет.
     */
    async checkTasksStatus() {
        // 1) Актуализируем статусы (ежечасно)
        await this.actualizeReviewTasks();

        // 2) В выходные/праздники — не уведомляем
        if (await this.isHoliday()) {
            return;
        }

        const now = nowUtc();
        const todayStart = startOfTodayUtc();
        const notifyWindowStart = todayStart.clone().hour(this.dailyNotificationHourUtc);

        // 3) До 05:00 UTC сегодня — ещё рано для «ежедневных» уведомлений
        if (now.isBefore(notifyWindowStart)) {
            return;
        }

        // 4) Ищем задачи в IN REVIEW и проверяем, что «уведомления за сегодня» ещё не было
        const tasks = await getReviewTasksByStatus(JiraStatusType.INREVIEW);

        for (const task of tasks) {
            try {
                const notifications = await getTaskNotifications(task.id);
                const lastNotification = getLastNotification(notifications);
                const lastNotifUtc = lastNotification ? moment.utc(lastNotification.created_at) : null;

                const taskUpdatedUtc = moment.utc(task.updated_at);

                if (
                    !shouldNotifyToday({
                        lastNotifUtc,
                        taskUpdatedUtc,
                        nowUtcObj: now,
                        todayStartUtc: todayStart,
                        notifyWindowStartUtc: notifyWindowStart,
                    })
                ) {
                    continue;
                }

                // Ещё раз проверяем актуальный статус в Jira на момент отправки
                const jiraTask = await JiraService.fetchTask(task.task_key);
                if (jiraTask.status === JiraStatusType.INREVIEW) {
                    await this.sendNotification(task);
                } else {
                    await updateReviewTaskStatus({
                        task_key: task.task_key,
                        status: jiraTask.status,
                    });
                }
            } catch (error) {
                logger.error(`Ошибка при обработке задачи ${task.task_key}:`, error);
            }
        }
    }

    /** Актуализация статусов задач на ревью (ежечасно) */
    async actualizeReviewTasks() {
        const tasks = await getNotClosedReviewTasks();
        for (const task of tasks) {
            try {
                const jiraTask = await JiraService.fetchTask(task.task_key);
                if (jiraTask.status !== task.status) {
                    await updateReviewTaskStatus({
                        task_key: task.task_key,
                        status: jiraTask.status,
                    });
                }
            } catch (error) {
                logger.error(`Ошибка при актуализации задачи ${task.task_key}:`, error);
            }
        }
    }

    /** Отправка уведомления в тред + отметка об отправке */
    async sendNotification(task) {
        const message =
            `Задача [${task.task_key}](https://jira.parcsis.org/browse/${task.task_key}) ` +
            `переведена в **${JiraStatusType.INREVIEW}** ${moment.utc(task.updated_at).fromNow()}.\n` +
            `${task.reviewer !== null ? task.reviewer : '@channel'}, пожалуйста, проверьте задачу.`;

        const post = await postMessageInTreed(task.post_id, message);
        if (post) {
            await addTaskNotification(task.id);
        }
    }

    /**
     * Обработка команды ревью (проксирует в commands/review)
     * @param {{taskKey:string, userName:string}} param0
     */
    async handleReviewCommand({ taskKey, userName }) {
        try {
            const user = await getUserByEmail(`${userName}@pravo.tech`);
            if (user !== null) {
                await reviewCommand({
                    post_id: null,
                    user_id: user.id,
                    user_name: `@${user.username}`,
                    args: [taskKey, null, null],
                });
            }
        } catch (error) {
            logger.error(error);
        }
    }

    /** Проверка, является ли день выходным */
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