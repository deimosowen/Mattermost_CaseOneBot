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
    return db.all('SELECT * FROM forward_channel_mapping');
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
const isMessageProcessed = (message_id, callback) => {
    db.get('SELECT * FROM forward_processed_messages WHERE message_id = ?', [message_id], (err, row) => {
        if (err) {
            callback(err, null);
        } else {
            callback(null, !!row);
        }
    });
};

const getChannelMapping = async (id) => {
    try {
        const row = await db.get(`SELECT * FROM forward_channel_mapping WHERE id = ?`, [id]);
        return row || null;
    } catch (err) {
        throw err;
    }
};

const deleteChannelMapping = async (id) => {
    return db.run('DELETE FROM forward_channel_mapping WHERE id = ?', id);
};

const getForwardMessageByMessageId = async (id) => {
    try {
        const row = await db.get(`SELECT * FROM forward_processed_messages WHERE message_id = ?`, [id]);
        return row || null;
    } catch (err) {
        throw err;
    }
};

module.exports = {
    getChannelMapping,
    addChannelMapping,
    getSourceChannelId,
    getAllChannelMappings,
    addProcessedMessage,
    isMessageProcessed,
    deleteChannelMapping,
    getForwardMessageByMessageId,
};
