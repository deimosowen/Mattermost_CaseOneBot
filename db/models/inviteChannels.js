const db = require('../index.js');
const logger = require('../../logger');

// Проверка существования таблицы
const checkTableExists = async () => {
    try {
        await db.get('SELECT 1 FROM invite_channels LIMIT 1');
        return true;
    } catch (err) {
        if (err.message && err.message.includes('no such table')) {
            logger.error('Таблица invite_channels не существует. Выполните миграцию: npm run migrate или db-migrate up');
            return false;
        }
        throw err;
    }
};

// Получение всех конфигураций каналов для приглашений
const getAllInviteChannels = async () => {
    try {
        const tableExists = await checkTableExists();
        if (!tableExists) {
            logger.warn('Таблица invite_channels не существует, возвращаем пустой массив');
            return [];
        }
        const rows = await db.all('SELECT * FROM invite_channels ORDER BY main_channel_id, prefix');
        return rows || [];
    } catch (err) {
        logger.error(`Error in getAllInviteChannels: ${err.message}`);
        throw err;
    }
};

// Получение конфигураций по основному каналу
const getInviteChannelsByMainChannel = async (mainChannelId) => {
    try {
        const tableExists = await checkTableExists();
        if (!tableExists) {
            return [];
        }
        const rows = await db.all('SELECT * FROM invite_channels WHERE main_channel_id = ? ORDER BY prefix', [mainChannelId]);
        return rows || [];
    } catch (err) {
        throw err;
    }
};

// Получение всех уникальных основных каналов
const getAllMainChannels = async () => {
    try {
        const rows = await db.all('SELECT DISTINCT main_channel_id FROM invite_channels ORDER BY main_channel_id');
        return rows.map(row => row.main_channel_id);
    } catch (err) {
        throw err;
    }
};

// Добавление конфигурации канала и префикса
const addInviteChannel = async (mainChannelId, prefix) => {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO invite_channels (main_channel_id, prefix, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, [mainChannelId, prefix], function (err) {
            if (err) {
                logger.error(`Error adding invite channel: ${err.message}`);
                reject(err);
            } else {
                logger.debug(`Invite channel added: id=${this.lastID}, main_channel_id=${mainChannelId}, prefix=${prefix}`);
                resolve(this.lastID);
            }
        });
    });
};

// Удаление конфигурации по ID
const removeInviteChannel = async (id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM invite_channels WHERE id = ?', [id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

// Удаление всех конфигураций для основного канала
const removeInviteChannelsByMainChannel = async (mainChannelId) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM invite_channels WHERE main_channel_id = ?', [mainChannelId], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

// Обновление конфигурации
const updateInviteChannel = async (id, mainChannelId, prefix) => {
    return new Promise((resolve, reject) => {
        db.run(`
            UPDATE invite_channels 
            SET main_channel_id = ?, prefix = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [mainChannelId, prefix, id], function (err) {
            if (err) {
                logger.error(`Error updating invite channel: ${err.message}`);
                reject(err);
            } else {
                logger.debug(`Invite channel updated: id=${id}, changes=${this.changes}, main_channel_id=${mainChannelId}, prefix=${prefix}`);
                resolve(this.changes);
            }
        });
    });
};

// Проверка существования конфигурации
const inviteChannelExists = async (mainChannelId, prefix) => {
    try {
        const tableExists = await checkTableExists();
        if (!tableExists) {
            return false;
        }
        const row = await db.get(
            'SELECT id FROM invite_channels WHERE main_channel_id = ? AND prefix = ?',
            [mainChannelId, prefix]
        );
        return !!row;
    } catch (err) {
        // Если ошибка "no such table" - возвращаем false, иначе пробрасываем
        if (err.message && err.message.includes('no such table')) {
            return false;
        }
        throw err;
    }
};

// Получение всех префиксов для основного канала (только массив префиксов)
const getPrefixesByMainChannel = async (mainChannelId) => {
    try {
        const rows = await db.all(
            'SELECT prefix FROM invite_channels WHERE main_channel_id = ? ORDER BY prefix',
            [mainChannelId]
        );
        return rows.map(row => row.prefix);
    } catch (err) {
        throw err;
    }
};

// Получение всех конфигураций в виде Map: main_channel_id -> [prefixes]
const getInviteChannelsMap = async () => {
    try {
        const allChannels = await getAllInviteChannels();
        const map = new Map();
        
        for (const channel of allChannels) {
            if (!map.has(channel.main_channel_id)) {
                map.set(channel.main_channel_id, []);
            }
            map.get(channel.main_channel_id).push(channel.prefix);
        }
        
        return map;
    } catch (err) {
        throw err;
    }
};

module.exports = {
    getAllInviteChannels,
    getInviteChannelsByMainChannel,
    getAllMainChannels,
    addInviteChannel,
    removeInviteChannel,
    removeInviteChannelsByMainChannel,
    updateInviteChannel,
    inviteChannelExists,
    getPrefixesByMainChannel,
    getInviteChannelsMap
};

