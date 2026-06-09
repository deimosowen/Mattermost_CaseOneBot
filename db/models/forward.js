const db = require('../index.js');

// Добавление маппинга каналов
const addChannelMapping = async (sourceChannelId, targetChannelId, message, threadMessage) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO forward_channel_mapping (source_channel_id, target_channel_id, message, thread_message )
             VALUES (?, ?, ?, ?)`,
            [sourceChannelId, targetChannelId, message, threadMessage],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
};

// Получение всех маппингов
const getAllChannelMappings = async () => {
    return db.all('SELECT * FROM forward_channel_mapping ORDER BY id DESC');
};

const getSourceChannelId = async (channel_id) => {
    try {
        const row = await db.get(`SELECT * FROM forward_channel_mapping WHERE source_channel_id = ?`, [channel_id]);
        return row || null;
    } catch (err) {
        throw err;
    }
};

// Добавление обработанного сообщения
const addProcessedMessage = async (channel_id, channel_name, user_id, user_name, message_id, send_message_id) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO forward_processed_messages (channel_id, channel_name, user_id, user_name, message_id, send_message_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [channel_id, channel_name, user_id, user_name, message_id, send_message_id],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
};

// Проверка, было ли сообщение обработано
const isMessageProcessed = async (message_id, callback) => {
    try {
        const row = await db.get('SELECT * FROM forward_processed_messages WHERE message_id = ?', [message_id]);
        const result = Boolean(row);
        if (callback) {
            callback(null, result);
        }
        return result;
    } catch (err) {
        if (callback) {
            callback(err, null);
            return false;
        }
        throw err;
    }
};

const getChannelMapping = async (id) => {
    try {
        const row = await db.get(`SELECT * FROM forward_channel_mapping WHERE id = ?`, [id]);
        return row || null;
    } catch (err) {
        throw err;
    }
};

const updateChannelMapping = async (id, sourceChannelId, targetChannelId, message, threadMessage) => {
    const result = await db.runAsync(
        `UPDATE forward_channel_mapping
         SET source_channel_id = ?, target_channel_id = ?, message = ?, thread_message = ?
         WHERE id = ?`,
        [sourceChannelId, targetChannelId, message, threadMessage, id]
    );
    return result.changes;
};

const deleteChannelMapping = async (id) => {
    const result = await db.runAsync('DELETE FROM forward_channel_mapping WHERE id = ?', [id]);
    return result.changes;
};

const getForwardMessageByMessageId = async (id) => {
    try {
        const row = await db.get(`SELECT * FROM forward_processed_messages WHERE message_id = ?`, [id]);
        return row || null;
    } catch (err) {
        throw err;
    }
};

const getForwardStatsBySourceChannel = async () => {
    return db.all(`
        SELECT channel_id, COUNT(*) AS forwarded_count, MAX(timestamp) AS last_forwarded_at
        FROM forward_processed_messages
        GROUP BY channel_id
    `);
};

module.exports = {
    getChannelMapping,
    addChannelMapping,
    updateChannelMapping,
    getSourceChannelId,
    getAllChannelMappings,
    addProcessedMessage,
    isMessageProcessed,
    deleteChannelMapping,
    getForwardMessageByMessageId,
    getForwardStatsBySourceChannel,
};
