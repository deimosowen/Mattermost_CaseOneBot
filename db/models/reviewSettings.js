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
const setChannelReviewSettings = async (channel_id, review_type, is_enabled) => {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT OR REPLACE INTO channel_review_settings (channel_id, review_type, is_enabled, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `, [channel_id, review_type, is_enabled], function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
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
    getAllChannelReviewSettings,
    deleteChannelReviewSettings
};
