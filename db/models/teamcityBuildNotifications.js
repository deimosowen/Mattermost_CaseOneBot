const db = require('../index.js');
const logger = require('../../logger');

/**
 * Получить все настройки уведомлений (включая неактивные)
 * @returns {Promise<Array>}
 */
const getAllNotifications = async () => {
    return db.all(`
        SELECT * FROM teamcity_build_notifications
        ORDER BY created_at DESC
    `);
};

/**
 * Получить настройку по ID
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const getNotificationById = async (id) => {
    return db.get('SELECT * FROM teamcity_build_notifications WHERE id = ?', [id]);
};

/**
 * Получить активные настройки по build_config_id
 * @param {string} buildConfigId
 * @returns {Promise<Array>}
 */
const getNotificationsByBuildConfig = async (buildConfigId) => {
    return db.all(`
        SELECT * FROM teamcity_build_notifications
        WHERE build_config_id = ? AND is_enabled = 1
    `, [buildConfigId]);
};

/**
 * Создать новую настройку уведомления
 * @param {Object} data
 * @returns {Promise<number>} ID созданной записи
 */
const createNotification = async (data) => {
    const {
        build_config_id,
        build_config_name,
        channel_id,
        channel_name,
        notify_on = 'all',
        is_enabled = true
    } = data;

    const result = await db.runAsync(`
        INSERT INTO teamcity_build_notifications 
        (build_config_id, build_config_name, channel_id, channel_name, notify_on, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [
        build_config_id,
        build_config_name,
        channel_id,
        channel_name,
        notify_on,
        is_enabled ? 1 : 0
    ]);

    return result.lastID;
};

/**
 * Обновить настройку уведомления
 * @param {number} id
 * @param {Object} data
 * @returns {Promise<void>}
 */
const updateNotification = async (id, data) => {
    const {
        build_config_id,
        build_config_name,
        channel_id,
        channel_name,
        notify_on,
        is_enabled,
        last_build_id,
        last_checked_at
    } = data;

    const updates = [];
    const params = [];

    if (build_config_id !== undefined) {
        updates.push('build_config_id = ?');
        params.push(build_config_id);
    }
    if (build_config_name !== undefined) {
        updates.push('build_config_name = ?');
        params.push(build_config_name);
    }
    if (channel_id !== undefined) {
        updates.push('channel_id = ?');
        params.push(channel_id);
    }
    if (channel_name !== undefined) {
        updates.push('channel_name = ?');
        params.push(channel_name);
    }
    if (notify_on !== undefined) {
        updates.push('notify_on = ?');
        params.push(notify_on);
    }
    if (is_enabled !== undefined) {
        updates.push('is_enabled = ?');
        params.push(is_enabled ? 1 : 0);
    }
    if (last_build_id !== undefined) {
        updates.push('last_build_id = ?');
        params.push(last_build_id);
    }
    if (last_checked_at !== undefined) {
        updates.push('last_checked_at = ?');
        params.push(last_checked_at);
    }

    if (updates.length === 0) {
        return;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await db.runAsync(`
        UPDATE teamcity_build_notifications
        SET ${updates.join(', ')}
        WHERE id = ?
    `, params);
};

/**
 * Удалить настройку уведомления
 * @param {number} id
 * @returns {Promise<void>}
 */
const deleteNotification = async (id) => {
    await db.runAsync('DELETE FROM teamcity_build_notifications WHERE id = ?', [id]);
};

/**
 * Обновить информацию о последней проверке
 * @param {number} id
 * @param {string} lastBuildId
 * @returns {Promise<void>}
 */
const updateLastChecked = async (id, lastBuildId) => {
    await db.runAsync(`
        UPDATE teamcity_build_notifications
        SET last_build_id = ?, last_checked_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, [lastBuildId, id]);
};

/**
 * Обновить post_id для настройки уведомления
 * @param {number} id
 * @param {string} postId
 * @returns {Promise<void>}
 */
const updatePostId = async (id, postId) => {
    await db.runAsync(`
        UPDATE teamcity_build_notifications
        SET post_id = ?
        WHERE id = ?
    `, [postId, id]);
};

module.exports = {
    getAllNotifications,
    getNotificationById,
    getNotificationsByBuildConfig,
    createNotification,
    updateNotification,
    deleteNotification,
    updateLastChecked,
    updatePostId
};

