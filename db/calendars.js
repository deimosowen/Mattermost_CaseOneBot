const db = require('./index.js');

const getAllUsers = async () => {
    return db.all('SELECT * FROM calendars');
}

const getUser = async (user_id) => {
    return db.get('SELECT * FROM calendars WHERE user_id = ?', user_id);
}

const updateUser = async (user_id, channel_id, tokens) => {
    const user = await getUser(user_id);
    if (user) {
        return db.run(`
            UPDATE calendars 
            SET access_token = ?, refresh_token = ?, scope = ?, token_type = ?, expiry_date = ? 
            WHERE user_id = ?`,
            tokens.access_token, tokens.refresh_token, tokens.scope, tokens.token_type, tokens.expiry_date, user_id
        );
    } else {
        return db.run(`
            INSERT INTO calendars (user_id, channel_id, access_token, refresh_token, scope, token_type, expiry_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            user_id, channel_id, tokens.access_token, tokens.refresh_token, tokens.scope, tokens.token_type, tokens.expiry_date
        );
    }
}

const removeUser = async (user_id) => {
    return db.run('DELETE FROM calendars WHERE user_id = ?', user_id);
}

const markEventAsNotified = async (user_id, event_id) => {
    return db.run('INSERT INTO notified_events (user_id, event_id) VALUES (?, ?)', user_id, event_id);
}

const checkIfEventWasNotified = async (user_id, event_id) => {
    const event = await db.get('SELECT * FROM notified_events WHERE user_id = ? AND event_id = ?', user_id, event_id);
    return event !== undefined;
}

const removeNotifiedEvents = async () => {
    return db.run('DELETE FROM notified_events');
}

module.exports = {
    getAllUsers,
    getUser,
    updateUser,
    removeUser,
    markEventAsNotified,
    checkIfEventWasNotified,
    removeNotifiedEvents,
};