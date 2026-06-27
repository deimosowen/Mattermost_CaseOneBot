const db = require('../index.js');

const STATUS = {
    PENDING: 'pending',
    SENT: 'sent',
    FAILED: 'failed'
};

async function addScheduledMessage(message) {
    const result = await db.runAsync(
        `INSERT INTO scheduled_messages
            (transport, payload_json, message, rule_type, send_after, status, attempts, max_attempts, source_type, source_id, idempotency_key, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            message.transport,
            JSON.stringify(message.payload || {}),
            message.message,
            message.rule_type || null,
            message.send_after,
            message.status || STATUS.PENDING,
            message.max_attempts,
            message.source_type || null,
            message.source_id || null,
            message.idempotency_key || null
        ]
    );
    return result.lastID;
}

async function getDueScheduledMessages(limit = 20) {
    return db.all(
        `SELECT *
         FROM scheduled_messages
         WHERE status = ?
           AND datetime(send_after) <= datetime('now')
         ORDER BY datetime(send_after) ASC, id ASC
         LIMIT ?`,
        [STATUS.PENDING, limit]
    );
}

async function getPendingScheduledMessageByIdempotencyKey(idempotencyKey) {
    if (!idempotencyKey) return null;
    return db.get(
        `SELECT *
         FROM scheduled_messages
         WHERE idempotency_key = ?
           AND status = ?
         LIMIT 1`,
        [idempotencyKey, STATUS.PENDING]
    );
}

async function markScheduledMessageSent(id) {
    const result = await db.runAsync(
        `UPDATE scheduled_messages
         SET status = ?, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, last_error = NULL
         WHERE id = ?`,
        [STATUS.SENT, id]
    );
    return result.changes;
}

async function markScheduledMessageFailed(id, errorMessage) {
    const result = await db.runAsync(
        `UPDATE scheduled_messages
         SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [STATUS.FAILED, errorMessage, id]
    );
    return result.changes;
}

async function incrementScheduledMessageAttempt(id, errorMessage) {
    const result = await db.runAsync(
        `UPDATE scheduled_messages
         SET attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [errorMessage, id]
    );
    return result.changes;
}

async function rescheduleScheduledMessage(id, sendAfter) {
    const result = await db.runAsync(
        `UPDATE scheduled_messages
         SET send_after = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [sendAfter, id]
    );
    return result.changes;
}

module.exports = {
    STATUS,
    addScheduledMessage,
    getDueScheduledMessages,
    getPendingScheduledMessageByIdempotencyKey,
    incrementScheduledMessageAttempt,
    markScheduledMessageFailed,
    markScheduledMessageSent,
    rescheduleScheduledMessage
};
