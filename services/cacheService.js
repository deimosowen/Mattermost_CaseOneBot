class CacheService {
    constructor() {
        this.cache = new Map(); // Хранилище данных в памяти
    }

    /**
     * Получение данных из кэша
     * @param {String} key - Ключ
     * @returns {Any} Данные
     */
    get(key) {
        return this.cache.get(key);
    }

    /**
     * Установка данных в кэше
     * @param {String} key - Ключ
     * @param {Any} value - Данные
     */
    set(key, value) {
        this.cache.set(key, value);
    }

    /**
     * Удаление данных из кэша
     * @param {String} key - Ключ
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Проверка существования ключа в кэше
     * @param {String} key - Ключ
     * @returns {Boolean} Существует ли ключ
     */
    has(key) {
        return this.cache.has(key);
    }
}

module.exports = new CacheService();