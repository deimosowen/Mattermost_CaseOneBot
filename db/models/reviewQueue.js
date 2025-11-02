const db = require('../index.js');

// Добавление ревьюера в очередь
const addReviewerToQueue = async (channel_id, user_id, user_name, order_number) => {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO review_queue (channel_id, user_id, user_name, order_number)
            VALUES (?, ?, ?, ?)
        `, [channel_id, user_id, user_name, order_number], function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
};

// Получение списка ревьюеров в очереди
const getReviewQueue = async (channel_id) => {
    try {
        const rows = await db.all(`
            SELECT * FROM review_queue 
            WHERE channel_id = ? 
            ORDER BY order_number ASC
        `, [channel_id]);
        return rows || [];
    } catch (err) {
        throw err;
    }
};

// Получение активных ревьюеров (не в отпуске)
const getActiveReviewQueue = async (channel_id) => {
    try {
        const currentDate = new Date().toISOString().split('T')[0];
        const rows = await db.all(`
            SELECT * FROM review_queue 
            WHERE channel_id = ? 
            AND (is_disabled = 0 OR return_date IS NULL OR return_date <= ?)
            ORDER BY order_number ASC
        `, [channel_id, currentDate]);
        return rows || [];
    } catch (err) {
        throw err;
    }
};

// Установка текущего ревьюера
const setCurrentReviewer = async (channel_id, user_id) => {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT OR REPLACE INTO review_current (channel_id, user_id, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, [channel_id, user_id], function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
};

// Получение текущего ревьюера
const getCurrentReviewer = async (channel_id) => {
    try {
        const row = await db.get('SELECT * FROM review_current WHERE channel_id = ?', [channel_id]);
        return row || null;
    } catch (err) {
        throw err;
    }
};

// Обновление статуса активности ревьюера
const updateReviewerActivityStatus = async (id, isDisabled, returnDate) => {
    return new Promise((resolve, reject) => {
        db.run(`
            UPDATE review_queue 
            SET is_disabled = ?, return_date = ? 
            WHERE id = ?
        `, [isDisabled, returnDate, id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

// Обновление порядка ревьюеров
const updateReviewQueueOrder = async (channel_id, order) => {
    const promises = order.map((id, index) => {
        return db.run(`
            UPDATE review_queue 
            SET order_number = ? 
            WHERE channel_id = ? AND id = ?
        `, [index, channel_id, id]);
    });

    return Promise.all(promises);
};

// Удаление ревьюера из очереди
const removeReviewerFromQueue = async (id, channel_id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM review_queue WHERE id = ? AND channel_id = ?', [id, channel_id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

// Удаление всех ревьюеров из очереди канала
const clearReviewQueue = async (channel_id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM review_queue WHERE channel_id = ?', [channel_id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

// Удаление текущего ревьюера
const deleteCurrentReviewer = async (channel_id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM review_current WHERE channel_id = ?', [channel_id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
};

module.exports = {
    addReviewerToQueue,
    getReviewQueue,
    getActiveReviewQueue,
    setCurrentReviewer,
    getCurrentReviewer,
    updateReviewerActivityStatus,
    updateReviewQueueOrder,
    removeReviewerFromQueue,
    clearReviewQueue,
    deleteCurrentReviewer
};
