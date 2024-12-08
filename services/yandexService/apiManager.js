const CacheService = require('../CacheService');
const YandexApi = require('./api');
const YandexService = require('./index');

class YandexApiManager {
    constructor() {
        this.cacheKeyPrefix = 'yandex_api_user_';
    }

    /**
     * Получение или создание инстанса YandexApi для пользователя
     * @param {String} userId - Идентификатор пользователя
     * @returns {YandexApi} Инстанс API
     */
    async getApiInstance(userId) {
        const cacheKey = this.getCacheKey(userId);

        // Если инстанс уже есть в кэше, возвращаем его
        if (CacheService.has(cacheKey)) {
            return CacheService.get(cacheKey);
        }

        // Получаем токены пользователя
        const tokens = await YandexService.getUserTokens(userId);

        // Создаём новый инстанс API и сохраняем в кэш
        const apiInstance = new YandexApi(tokens.login, tokens.access_token);
        await apiInstance.init();

        CacheService.set(cacheKey, apiInstance);
        return apiInstance;
    }

    /**
     * Обновление токенов пользователя
     * @param {String} userId - Идентификатор пользователя
     */
    async updateTokens(userId) {
        const cacheKey = this.getCacheKey(userId);

        // Удаляем старый инстанс из кэша
        if (CacheService.has(cacheKey)) {
            CacheService.delete(cacheKey);
        }

        // Создаём новый инстанс API с обновлёнными токенами
        return this.getApiInstance(userId);
    }

    /**
     * Генерация ключа для кэша
     * @param {String} userId - Идентификатор пользователя
     * @returns {String} Ключ кэша
     */
    getCacheKey(userId) {
        return `${this.cacheKeyPrefix}${userId}`;
    }
}

module.exports = new YandexApiManager();