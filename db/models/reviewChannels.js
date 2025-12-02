const db = require('../index.js');
const logger = require('../../logger');

// Проверка существования таблицы
const checkTableExists = async () => {
    try {
        await db.get('SELECT 1 FROM review_channels LIMIT 1');
        return true;
    } catch (err) {
        if (err.message && err.message.includes('no such table')) {
            logger.error('Таблица review_channels не существует. Выполните миграцию: npm run migrate или db-migrate up');
            return false;
        }
        throw err;
    }
};

// Получение всех каналов ревью
const getAllReviewChannels = async () => {
    try {
        const tableExists = await checkTableExists();
        if (!tableExists) {
            logger.warn('Таблица review_channels не существует, возвращаем пустой массив');
            return [];
        }
        const rows = await db.all('SELECT * FROM review_channels ORDER BY channel_id');
        return rows || [];
    } catch (err) {
        logger.error(`Error in getAllReviewChannels: ${err.message}`);
        throw err;
    }
};

// Получение всех ID каналов ревью (массив строк)
const getAllReviewChannelIds = async () => {
    try {
        const tableExists = await checkTableExists();
        if (!tableExists) {
            return [];
        }
        const rows = await db.all('SELECT channel_id FROM review_channels ORDER BY channel_id');
        return rows.map(row => row.channel_id);
    } catch (err) {
        logger.error(`Error in getAllReviewChannelIds: ${err.message}`);
        throw err;
    }
};

// Проверка, является ли канал каналом ревью
const isReviewChannel = async (channelId) => {
    try {
        const tableExists = await checkTableExists();
        if (!tableExists) {
            return false;
        }
        const row = await db.get('SELECT id FROM review_channels WHERE channel_id = ?', [channelId]);
        return !!row;
    } catch (err) {
        if (err.message && err.message.includes('no such table')) {
            return false;
        }
        throw err;
    }
};

// Добавление канала ревью
const addReviewChannel = async (channelId) => {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO review_channels (channel_id, updated_at)
            VALUES (?, CURRENT_TIMESTAMP)
        `, [channelId], function (err) {
            if (err) {
                logger.error(`Error adding review channel: ${err.message}`);
                reject(err);
            } else {
                logger.debug(`Review channel added: id=${this.lastID}, channel_id=${channelId}`);
                resolve(this.lastID);
            }
        });
    });
};

// Удаление канала ревью по ID записи
const removeReviewChannel = async (id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM review_channels WHERE id = ?', [id], function (err) {
            if (err) {
                logger.error(`Error removing review channel: ${err.message}`);
                reject(err);
            } else {
                resolve(this.changes);
            }
        });
    });
};

// Удаление канала ревью по channel_id
const removeReviewChannelByChannelId = async (channelId) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM review_channels WHERE channel_id = ?', [channelId], function (err) {
            if (err) {
                logger.error(`Error removing review channel by channel_id: ${err.message}`);
                reject(err);
            } else {
                resolve(this.changes);
            }
        });
    });
};

// Проверка существования канала ревью
const reviewChannelExists = async (channelId) => {
    try {
        const tableExists = await checkTableExists();
        if (!tableExists) {
            return false;
        }
        const row = await db.get('SELECT id FROM review_channels WHERE channel_id = ?', [channelId]);
        return !!row;
    } catch (err) {
        if (err.message && err.message.includes('no such table')) {
            return false;
        }
        throw err;
    }
};

module.exports = {
    getAllReviewChannels,
    getAllReviewChannelIds,
    isReviewChannel,
    addReviewChannel,
    removeReviewChannel,
    removeReviewChannelByChannelId,
    reviewChannelExists
};

