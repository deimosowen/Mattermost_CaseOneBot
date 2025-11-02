const { getChannelMembers, getUser } = require('../mattermost/utils');
const absenceService = require('./absenceService');
const cacheService = require('./cacheService');
const { 
    getChannelReviewSettings, 
    setChannelReviewSettings 
} = require('../db/models/reviewSettings');
const { 
    getActiveReviewQueue, 
    setCurrentReviewer, 
    getCurrentReviewer,
    updateReviewerActivityStatus 
} = require('../db/models/reviewQueue');
const { updateReviewTaskReviewer } = require('../db/models/reviewTask');
const logger = require('../logger');
const moment = require('moment');

class ReviewDistributionService {
    constructor() {
        this.REVIEW_TYPES = {
            MANUAL: 'manual',
            QUEUE: 'queue'
        };
        this.cachePrefix = 'review_availability:';
        this.cacheTtlHours = 24; // Кэш на 24 часа (отпуска известны заранее)
    }

    /**
     * Получает следующего ревьюера для канала
     * @param {string} channel_id - ID канала
     * @returns {Promise<Object|null>} - Следующий ревьюер или null
     */
    async getNextReviewer(channel_id) {
        try {
            const settings = await getChannelReviewSettings(channel_id);
            
            if (!settings || !settings.is_enabled) {
                return null;
            }

            if (settings.review_type === this.REVIEW_TYPES.MANUAL) {
                return null; // Ручное назначение
            }

            if (settings.review_type === this.REVIEW_TYPES.QUEUE) {
                return await this._getNextReviewerFromQueue(channel_id);
            }

            return null;
        } catch (error) {
            logger.error(`[ReviewDistributionService] Ошибка получения следующего ревьюера: ${error.message}`);
            return null;
        }
    }

    /**
     * Получает следующего ревьюера из очереди
     * @param {string} channel_id - ID канала
     * @returns {Promise<Object|null>} - Следующий ревьюер или null
     */
    async _getNextReviewerFromQueue(channel_id) {
        try {
            // Получаем активных ревьюеров (не в отпуске)
            const activeReviewers = await this._getActiveReviewersWithAvailabilityCheck(channel_id);
            
            if (activeReviewers.length === 0) {
                logger.warn(`[ReviewDistributionService] Нет активных ревьюеров в канале ${channel_id}`);
                return null;
            }

            // Получаем текущего ревьюера
            const currentReviewer = await getCurrentReviewer(channel_id);
            
            if (!currentReviewer) {
                // Если нет текущего ревьюера, берем первого из списка
                const nextReviewer = activeReviewers[0];
                await setCurrentReviewer(channel_id, nextReviewer.user_id);
                return nextReviewer;
            }

            // Находим следующего ревьюера в очереди
            const currentIndex = activeReviewers.findIndex(r => r.user_id === currentReviewer.user_id);
            const nextIndex = (currentIndex + 1) % activeReviewers.length;
            const nextReviewer = activeReviewers[nextIndex];
            
            // Обновляем текущего ревьюера
            await setCurrentReviewer(channel_id, nextReviewer.user_id);
            
            return nextReviewer;
        } catch (error) {
            logger.error(`[ReviewDistributionService] Ошибка получения ревьюера из очереди: ${error.message}`);
            return null;
        }
    }

    /**
     * Получает ключ кэша для проверки доступности
     * @param {string} email - Email сотрудника
     * @param {string} date - Дата в формате YYYY-MM-DD
     * @returns {string} - Ключ кэша
     */
    _getCacheKey(email, date) {
        return `${this.cachePrefix}${email}:${date}`;
    }

    /**
     * Получает доступность сотрудника из кэша
     * @param {string} email - Email сотрудника
     * @param {string} date - Дата в формате YYYY-MM-DD
     * @returns {boolean|null} - Доступность или null, если нет в кэше
     */
    _getCachedAvailability(email, date) {
        const cacheKey = this._getCacheKey(email, date);
        const cached = cacheService.get(cacheKey);
        
        if (cached && cached.expires > Date.now()) {
            return cached.value;
        }
        
        // Удаляем устаревший кэш
        if (cached) {
            cacheService.delete(cacheKey);
        }
        
        return null;
    }

    /**
     * Сохраняет доступность сотрудника в кэш
     * @param {string} email - Email сотрудника
     * @param {string} date - Дата в формате YYYY-MM-DD
     * @param {boolean} isAvailable - Доступность
     */
    _setCachedAvailability(email, date, isAvailable) {
        const cacheKey = this._getCacheKey(email, date);
        cacheService.set(cacheKey, {
            value: isAvailable,
            expires: Date.now() + this.cacheTtlHours * 60 * 60 * 1000
        });
    }

    /**
     * Получает доступность сотрудников с использованием кэша
     * @param {Array<string>} emails - Массив email'ов
     * @param {string} date - Дата в формате YYYY-MM-DD
     * @returns {Promise<Object>} - Объект с доступностью по email
     */
    async _getAvailabilityWithCache(emails, date) {
        const currentDateISO = moment(date).toISOString();
        const availability = {};
        const emailsToCheck = [];

        // Проверяем кэш для каждого email
        emails.forEach((email) => {
            const cached = this._getCachedAvailability(email, date);
            if (cached !== null) {
                availability[email] = { [currentDateISO]: cached };
            } else {
                emailsToCheck.push(email);
            }
        });

        // Если все найдены в кэше, возвращаем результат
        if (emailsToCheck.length === 0) {
            return availability;
        }

        // Запрашиваем отсутствующие в кэше
        try {
            const result = await absenceService.checkEmployeeAvailabilityByDate({
                employeeEmails: emailsToCheck,
                dates: [date]
            });

            // Сохраняем результаты в кэш и добавляем к общему результату
            if (result && Object.keys(result).length > 0) {
                Object.keys(result).forEach(email => {
                    const isAvailable = result[email]?.[currentDateISO];
                    
                    // Сохраняем в кэш (по умолчанию доступен, если не указано иначе)
                    this._setCachedAvailability(email, date, isAvailable !== false);
                    
                    // Добавляем к результату
                    availability[email] = result[email];
                });
            } else {
                // Если результат пустой, считаем всех доступными и кэшируем
                emailsToCheck.forEach(email => {
                    this._setCachedAvailability(email, date, true);
                    availability[email] = { [currentDateISO]: true };
                });
            }

            return availability;
        } catch (error) {
            logger.error(`[ReviewDistributionService] Ошибка проверки доступности: ${error.message}`);
            // В случае ошибки возвращаем пустой объект для недостающих
            emailsToCheck.forEach(email => {
                if (!availability[email]) {
                    availability[email] = { [currentDateISO]: true }; // По умолчанию доступен
                }
            });
            return availability;
        }
    }

    /**
     * Получает активных ревьюеров с проверкой доступности
     * @param {string} channel_id - ID канала
     * @returns {Promise<Array>} - Список активных ревьюеров
     */
    async _getActiveReviewersWithAvailabilityCheck(channel_id) {
        try {
            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();
            
            // Получаем всех ревьюеров из очереди
            const allReviewers = await getActiveReviewQueue(channel_id);
            
            if (allReviewers.length === 0) {
                return [];
            }

            // Получаем email'ы ревьюеров из Mattermost
            const mattermostUsers = await Promise.all(
                allReviewers.map(reviewer => getUser(reviewer.user_id))
            );

            // Проверяем доступность через кэш и absenceService
            const emails = mattermostUsers.map(user => user.email);
            const availability = await this._getAvailabilityWithCache(emails, currentDate);

            // Обновляем статусы ревьюеров и фильтруем доступных
            const availableReviewers = [];
            
            for (let i = 0; i < allReviewers.length; i++) {
                const reviewer = allReviewers[i];
                const mattermostUser = mattermostUsers[i];
                const isAvailable = availability[mattermostUser.email]?.[currentDateISO];

                if (!isAvailable) {
                    // Пользователь в отпуске - обновляем статус
                    await updateReviewerActivityStatus(reviewer.id, true, currentDate);
                } else {
                    // Пользователь доступен
                    availableReviewers.push(reviewer);
                }
            }

            return availableReviewers;
        } catch (error) {
            logger.error(`[ReviewDistributionService] Ошибка проверки доступности ревьюеров: ${error.message}`);
            // В случае ошибки возвращаем всех ревьюеров
            return await getActiveReviewQueue(channel_id);
        }
    }

    /**
     * Автоматически назначает ревьюера для задачи
     * @param {string} channel_id - ID канала
     * @param {string} task_key - Ключ задачи
     * @returns {Promise<Object|null>} - Назначенный ревьюер или null
     */
    async assignReviewerForTask(channel_id, task_key) {
        try {
            const nextReviewer = await this.getNextReviewer(channel_id);
            
            if (!nextReviewer) {
                return null;
            }

            // Обновляем задачу с назначенным ревьюером
            await updateReviewTaskReviewer({
                reviewer: nextReviewer.user_name,
                task_key: task_key
            });

            logger.info(`[ReviewDistributionService] Назначен ревьюер ${nextReviewer.user_name} для задачи ${task_key}`);
            
            return nextReviewer;
        } catch (error) {
            logger.error(`[ReviewDistributionService] Ошибка назначения ревьюера: ${error.message}`);
            return null;
        }
    }

    /**
     * Включает автоматическое распределение для канала
     * @param {string} channel_id - ID канала
     * @param {string} review_type - Тип ревью ('manual' или 'queue')
     * @returns {Promise<boolean>} - Успешность операции
     */
    async enableAutoDistribution(channel_id, review_type = this.REVIEW_TYPES.QUEUE) {
        try {
            await setChannelReviewSettings(channel_id, review_type, true);
            logger.info(`[ReviewDistributionService] Включено автоматическое распределение для канала ${channel_id}, тип: ${review_type}`);
            return true;
        } catch (error) {
            logger.error(`[ReviewDistributionService] Ошибка включения автоматического распределения: ${error.message}`);
            return false;
        }
    }

    /**
     * Отключает автоматическое распределение для канала
     * @param {string} channel_id - ID канала
     * @returns {Promise<boolean>} - Успешность операции
     */
    async disableAutoDistribution(channel_id) {
        try {
            await setChannelReviewSettings(channel_id, this.REVIEW_TYPES.MANUAL, false);
            logger.info(`[ReviewDistributionService] Отключено автоматическое распределение для канала ${channel_id}`);
            return true;
        } catch (error) {
            logger.error(`[ReviewDistributionService] Ошибка отключения автоматического распределения: ${error.message}`);
            return false;
        }
    }

    /**
     * Получает настройки ревью для канала
     * @param {string} channel_id - ID канала
     * @returns {Promise<Object|null>} - Настройки ревью или null
     */
    async getChannelSettings(channel_id) {
        try {
            return await getChannelReviewSettings(channel_id);
        } catch (error) {
            logger.error(`[ReviewDistributionService] Ошибка получения настроек канала: ${error.message}`);
            return null;
        }
    }
}

module.exports = new ReviewDistributionService();
