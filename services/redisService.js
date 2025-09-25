const Redis = require('ioredis');
const config = require('../config');
const logger = require('../logger');

class RedisService {
    constructor() {
        this.client = null;
        this.isConnected = false;

        this.defaultTTL = null;
        this.contextPrefix = 'context:';

        this._onError = this._onError.bind(this);
        this._onConnect = this._onConnect.bind(this);
    }

    /**
     * Инициализация подключения к Redis (идемпотентно).
     * Вызывается один раз при старте приложения.
     * @param {object} [overrides] — опции ioredis для локальной подмены
     */
    init(overrides = {}) {
        if (this.client) return this.client;

        const options = {
            host: config.REDIS_HOST,
            port: config.REDIS_PORT,
            password: config.REDIS_PASSWORD,
            // как и раньше — без автоповторов
            retryStrategy: () => null,
            ...overrides,
        };

        try {
            this.client = new Redis(options);
            this.client.on('error', this._onError);
            this.client.on('connect', this._onConnect);
            return this.client;
        } catch (error) {
            logger.error(`Redis initialization error: ${error.message}`);
            this.isConnected = false;
            this.client = null;
            return null;
        }
    }

    /**
     * Корректное завершение подключения.
     * Вызывается при остановке приложения (graceful shutdown).
     */
    async shutdown() {
        if (!this.client) return;
        try {
            this.client.off('error', this._onError);
            this.client.off('connect', this._onConnect);
            await this.client.quit();
        } catch (error) {
            logger.error(`Redis shutdown error: ${error.message}`);
        } finally {
            this.client = null;
            this.isConnected = false;
        }
    }

    _onError(error) {
        logger.error(`Redis connection error: ${error.message}`);
        this.isConnected = false;
    }

    _onConnect() {
        logger.info('Redis connected successfully');
        this.isConnected = true;
    }

    _key(key) {
        return `${this.contextPrefix}${key}`;
    }

    async get(key) {
        if (!this.isConnected || !this.client) {
            return { context: [] };
        }
        try {
            const value = await this.client.get(this._key(key));
            return value ? JSON.parse(value) : { context: [] };
        } catch (error) {
            logger.error(`Ошибка при получении из Redis: ${error.message}`);
            return { context: [] };
        }
    }

    async append(key, contextKey, contextValue, ttl = this.defaultTTL) {
        if (!this.isConnected || !this.client) {
            return { context: [] };
        }
        try {
            const existingContext = await this.get(key);
            if (!existingContext.context) existingContext.context = [];

            existingContext.context.push({ [contextKey]: contextValue });

            // TTL параметр оставлен как в исходнике (не применяется), чтобы не менять логику.
            await this.client.set(this._key(key), JSON.stringify(existingContext));
            return existingContext;
        } catch (error) {
            logger.error(`Ошибка при обновлении в Redis: ${error.message}`);
            return { context: [] };
        }
    }
}

module.exports = new RedisService();