const moment = require('moment');
const dayOffAPI = require('isdayoff')();
const cache = require('./cacheService');
const logger = require('../logger');

/**
 * Сервис проверки выходных дней через isdayoff.ru (UTC)
 * Добавлено безопасное обращение к API и кеширование.
 */
class DayOffService {
    constructor(options = {}) {
        this.api = dayOffAPI;
        this.country = options.country || 'ru';
        this.cachePrefix = 'dayoff:';
        this.cacheTtlMinutes = options.cacheTtlMinutes || 60;
    }

    /**
     * Проверяет, является ли указанная дата (UTC) выходным.
     * @param {moment.Moment|Date|string|null} date
     * @returns {Promise<boolean>}
     */
    async isHoliday(date = null) {
        const utcDate = moment.utc(date || undefined).startOf('day');
        const cacheKey = `${this.cachePrefix}${utcDate.format('YYYY-MM-DD')}`;

        try {
            // Проверка кеша
            const cached = cache.get(cacheKey);
            if (cached && cached.expires > Date.now()) {
                return cached.value;
            }

            // Запрос к API
            const result = await this.api.date({
                year: utcDate.year(),
                month: utcDate.month(),
                date: utcDate.date(),
                country: this.country,
            });

            // 0 — рабочий, 1/2/4 — выходной/праздник
            const isHoliday = result === 1 || result === 2 || result === 4;

            // Сохраняем в кеш
            cache.set(cacheKey, {
                value: isHoliday,
                expires: Date.now() + this.cacheTtlMinutes * 60_000,
            });

            return isHoliday;
        } catch (error) {
            // Безопасный fallback
            logger.error(`[DayOffService] Ошибка при проверке даты ${utcDate.format()}: ${error.message}\n${error.stack}`);
            return false;
        }
    }

    /**
     * Проверяет, является ли сегодня (UTC) выходным днём.
     * @returns {Promise<boolean>}
     */
    async isTodayHoliday() {
        try {
            return await this.isHoliday(moment.utc());
        } catch (error) {
            logger.error(`[DayOffService] Ошибка при isTodayHoliday: ${error.message}`);
            return false;
        }
    }

    /**
     * Возвращает следующую рабочую дату (UTC)
     * @param {moment.Moment|Date|string|null} fromDate
     * @returns {Promise<moment.Moment>}
     */
    async getNextWorkday(fromDate = null) {
        let date = moment.utc(fromDate || undefined).add(1, 'day').startOf('day');
        while (await this.isHoliday(date)) {
            date.add(1, 'day');
        }
        return date;
    }
}

module.exports = new DayOffService();
