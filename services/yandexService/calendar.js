const moment = require('moment-timezone');
const { getUser: getMattermostUser, postMessage, setStatus } = require('../../mattermost/utils');
const { markEventAsNotified, checkIfEventWasNotified, markStatusAsSet, checkIfStatusWasSet, removeNotifiedEvents } = require('../../db/models/calendars');
const CacheService = require('../cacheService');
const YandexService = require('./index');
const YandexApiManager = require('./apiManager');
const { CronJob } = require('cron');
const logger = require('../../logger');

class CalendarManager {
    constructor() {
        this.notificationCronSchedule = '* * * * *'; // Каждый 1 минуту
        this.cleanupCronSchedule = '0 22 * * 0'; // Каждое воскресенье в 22:00
    }

    /**
     * Инициализация задач на уведомления и очистку
     */
    init() {
        this.startNotificationJob();
        this.startCleanupJob();
    }

    /**
     * Запуск задачи уведомлений
     */
    startNotificationJob() {
        new CronJob(this.notificationCronSchedule, async () => {
            try {
                await this.notifyAllUsers();
            } catch (error) {
                logger.error('Ошибка в задаче уведомлений:', error);
            }
        }, null, true, 'UTC').start();
    }

    /**
     * Запуск задачи очистки
     */
    startCleanupJob() {
        new CronJob(this.cleanupCronSchedule, async () => {
            try {
                await removeNotifiedEvents();
                logger.info('Очистка уведомлений выполнена.');
            } catch (error) {
                logger.error('Ошибка в задаче очистки:', error);
            }
        }, null, true, 'UTC').start();
    }

    /**
     * Уведомление всех пользователей
     */
    async notifyAllUsers() {
        const users = await YandexService.getAllUsersTokens();
        await Promise.all(users.map(user => this.notifyUser(user)));
    }

    /**
     * Уведомление конкретного пользователя
     * @param {Object} user 
     */
    async notifyUser(user) {
        if (user.is_notification) {
            await this.listAndNotifyEvents(user);
        }
    }

    /**
     * Получение событий и отправка уведомлений
     * @param {Object} user 
     */
    async listAndNotifyEvents(user) {
        try {
            const api = await YandexApiManager.getApiInstance(user.user_id);

            const mattermostUser = await this.getUserFromCache(user.user_id);
            const timezone = mattermostUser.timezone.useAutomaticTimezone === 'true'
                ? mattermostUser.timezone.automaticTimezone
                : mattermostUser.timezone.manualTimezone;

            const now = moment().utc();

            const formattedStartTime = now.clone().format('YYYYMMDDTHHmmss[Z]');
            const formattedEndTime = now.clone().add(user.notification_interval, 'minutes').format('YYYYMMDDTHHmmss[Z]');

            const events = await api.listEvents(formattedStartTime, formattedEndTime);

            for (const event of events) {
                await this.processEvent(user, event, now, timezone);
            }
        } catch (error) {
            logger.error(error);
        }
    }

    /**
     * Обработка события: отправка уведомлений, установка статусов
     * @param {Object} user 
     * @param {Object} event 
     * @param {Object} now 
     * @param {String} timezone 
     */
    async processEvent(user, event, now, timezone) {
        const eventStartTime = event.start;
        const nowTime = now.clone().set({
            year: 0,
            month: 0,
            date: 0,
        });
        const eventTime = eventStartTime.clone().set({
            year: 0,
            month: 0,
            date: 0,
        });

        if (eventTime.isAfter(nowTime) && !(await checkIfEventWasNotified(user.user_id, event.id))) {
            const message = this.createEventMessage(event, timezone);
            await postMessage(user.channel_id, message);
            await markEventAsNotified(user.user_id, event);
        }
        if (user.mattermost_token && eventStartTime.isSameOrBefore(now) && !(await checkIfStatusWasSet(user.user_id, event.id))) {
            const statusText = user.event_summary || event.summary;
            const status = await setStatus(user.user_id, user.mattermost_token, statusText, event.end, user.dnd_mode);
            if (status) {
                await markStatusAsSet(user.user_id, event.id);
            }
        }
    }

    /**
     * Получает пользователя из кэша или загружает его
     * @param {String} userId - Идентификатор пользователя
     * @returns {Object} Данные пользователя
     */
    async getUserFromCache(userId) {
        const cacheKey = `mattermost_user_${userId}`;

        if (CacheService.has(cacheKey)) {
            return CacheService.get(cacheKey);
        }

        const mattermostUser = await getMattermostUser(userId);

        CacheService.set(cacheKey, mattermostUser);
        return mattermostUser;
    }

    /**
     * Создание сообщения для события
     * @param {Object} event 
     * @param {String} timezone 
     * @returns {String}
     */
    createEventMessage(event, timezone) {
        try {
            const eventStart = event.start.tz(timezone);
            const description = event.description
                ? `${this.formatDescription(event.description)}`
                : '';
            return `**${event.summary}**\n*${eventStart.format('LLL')}*\n${description}`;
        } catch (error) {
            logger.error('Ошибка при создании сообщения:', error);
            return '';
        }
    }

    /**
     * Парсинг описания события для замены ссылок на формат [url](url)
     * @param {String} description - Описание события
     * @returns {String} Описание с замененными ссылками
     */
    formatDescription = (description) => {
        if (!description) return '';

        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const formattedDescription = description.replace(urlRegex, (url) => `[${url}](${url})`);
        return formattedDescription;
    };

    /**
     * Получение события по ID
     * @param {String} userId 
     * @param {String} eventId 
     */
    async getEventById(userId, eventId) {
        try {
            const api = await YandexApiManager.getApiInstance(userId);
            return await api.getEventById(eventId);
        } catch (error) {
            logger.error(error);
        }
    }
}

module.exports = new CalendarManager();