const db = require('../index.js');

// Получение настроек ревью для канала
const getChannelReviewSettings = async (channel_id) => {
    try {
        const row = await db.get('SELECT * FROM channel_review_settings WHERE channel_id = ?', [channel_id]);
        return row || null;
    } catch (err) {
        throw err;
    }
};

// Создание или обновление настроек ревью для канала
// allow_arch_review и arch_review_tag опциональны (при обновлении сохраняются старые значения, если не переданы)
const setChannelReviewSettings = async (channel_id, review_type, is_enabled, allow_arch_review, arch_review_tag) => {
    const existing = await getChannelReviewSettings(channel_id);
    const allowArch = allow_arch_review !== undefined ? allow_arch_review : (existing?.allow_arch_review ? 1 : 0);
    const archTag = arch_review_tag !== undefined && arch_review_tag !== null ? arch_review_tag : (existing?.arch_review_tag || '');

    if (existing) {
        await db.runAsync(`
            UPDATE channel_review_settings
            SET review_type = ?, is_enabled = ?, allow_arch_review = ?, arch_review_tag = ?, updated_at = CURRENT_TIMESTAMP
            WHERE channel_id = ?
        `, [review_type, is_enabled, allowArch ? 1 : 0, archTag, channel_id]);
        return existing.id;
    }
    const r = await db.runAsync(`
        INSERT INTO channel_review_settings (channel_id, review_type, is_enabled, allow_arch_review, arch_review_tag, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [channel_id, review_type, is_enabled ? 1 : 0, allowArch ? 1 : 0, archTag]);
    return r.lastID;
};

// Полное обновление настроек канала (включая архитектурное ревью)
const saveChannelReviewSettings = async (channel_id, options) => {
    const { review_type = 'manual', is_enabled = false, allow_arch_review = false, arch_review_tag = '' } = options || {};
    const existing = await getChannelReviewSettings(channel_id);
    if (existing) {
        await db.runAsync(`
            UPDATE channel_review_settings
            SET review_type = ?, is_enabled = ?, allow_arch_review = ?, arch_review_tag = ?, updated_at = CURRENT_TIMESTAMP
            WHERE channel_id = ?
        `, [review_type, is_enabled ? 1 : 0, allow_arch_review ? 1 : 0, arch_review_tag || '', channel_id]);
        return existing.id;
    }
    const r = await db.runAsync(`
        INSERT INTO channel_review_settings (channel_id, review_type, is_enabled, allow_arch_review, arch_review_tag, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [channel_id, review_type, is_enabled ? 1 : 0, allow_arch_review ? 1 : 0, arch_review_tag || '']);
    return r.lastID;
};

// Получение всех настроек ревью
const getAllChannelReviewSettings = async () => {
    try {
        const rows = await db.all('SELECT * FROM channel_review_settings');
        return rows || [];
    } catch (err) {
        throw err;
    }
};

// Удаление настроек ревью для канала
const deleteChannelReviewSettings = async (channel_id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM channel_review_settings WHERE channel_id = ?', [channel_id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

module.exports = {
    getChannelReviewSettings,
    setChannelReviewSettings,
    saveChannelReviewSettings,
    getAllChannelReviewSettings,
    deleteChannelReviewSettings
};
