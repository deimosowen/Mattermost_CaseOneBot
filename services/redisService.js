const Redis = require('ioredis');
const config = require('../config');
const logger = require('../logger');

class RedisService {
    constructor() {
        try {
            this.client = new Redis({
                host: config.REDIS_HOST,
                port: config.REDIS_PORT,
                password: config.REDIS_PASSWORD,
                retryStrategy: () => null
            });

            this.client.on('error', (error) => {
                logger.error(`Redis connection error: ${error.message}`);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                logger.info('Redis connected successfully');
                this.isConnected = true;
            });

        } catch (error) {
            logger.error(`Redis initialization error: ${error.message}`);
            this.isConnected = false;
            this.client = null;
        }

        this.defaultTTL = null;
        this.contextPrefix = 'context:';
    }

    async get(key) {
        if (!this.isConnected) {
            return { context: [] };
        }

        try {
            const value = await this.client.get(`${this.contextPrefix}${key}`);
            return value ? JSON.parse(value) : { context: [] };
        } catch (error) {
            logger.error(`Ошибка при получении из Redis: ${error.message}`);
            return { context: [] };
        }
    }

    async append(key, contextKey, contextValue, ttl = this.defaultTTL) {
        if (!this.isConnected) {
            return { context: [] };
        }

        try {
            const existingContext = await this.get(key);

            if (!existingContext.context) {
                existingContext.context = [];
            }

            existingContext.context.push({
                [contextKey]: contextValue
            });

            await this.client.set(
                `${this.contextPrefix}${key}`,
                JSON.stringify(existingContext)
            );

            return existingContext;
        } catch (error) {
            logger.error(`Ошибка при обновлении в Redis: ${error.message}`);
            return { context: [] };
        }
    }
}

module.exports = new RedisService(); 