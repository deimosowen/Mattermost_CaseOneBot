const db = require('../index.js');

const getAllUsers = async () => {
    return db.all(`
    SELECT c.*, s.notification_interval, s.is_notification, s.authuser
    FROM calendars c
    LEFT JOIN user_settings s ON c.user_id = s.user_id
    `);
}

const getUser = async (user_id) => {
    return db.get(`
        SELECT c.*, s.notification_interval, s.is_notification, s.authuser
        FROM calendars c
        LEFT JOIN user_settings s ON c.user_id = s.user_id
        WHERE c.user_id = ?
    `, user_id);
}

const createUser = async (user_id, channel_id, tokens) => {
    await db.run(`
            INSERT INTO calendars (user_id, channel_id, access_token, refresh_token, scope, token_type, expiry_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        user_id, channel_id, tokens.access_token, tokens.refresh_token, tokens.scope, tokens.token_type, tokens.expiry_date
    );
}

const updateUser = async (user_id, channel_id, tokens) => {
    const user = await getUser(user_id);
    if (user) {
        await db.run(`
            UPDATE calendars 
            SET access_token = ?, refresh_token = ?, scope = ?, token_type = ?, expiry_date = ? 
            WHERE user_id = ?`,
            tokens.access_token, tokens.refresh_token, tokens.scope, tokens.token_type, tokens.expiry_date, user_id
        );
    } else {
        await db.run(`
            INSERT INTO calendars (user_id, channel_id, access_token, refresh_token, scope, token_type, expiry_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            user_id, channel_id, tokens.access_token, tokens.refresh_token, tokens.scope, tokens.token_type, tokens.expiry_date
        );

        const userSettings = await getUserSettings(user_id);
        if (!userSettings) {
            await createUserSettings(user_id);
        }
    }
}

const removeUser = async (user_id) => {
    return db.run('DELETE FROM calendars WHERE user_id = ?', user_id);
}

const getUserSettings = async (user_id) => {
    return db.get('SELECT * FROM user_settings WHERE user_id = ?', user_id);
}

const createUserSettings = async (user_id) => {
    return await db.run(`
    INSERT INTO user_settings (user_id, timezone, language, notification_interval, is_notification, authuser) 
    VALUES (?, 'UTC', 'ru', 10, 1, 0)`, user_id);
}

const updateUserSettings = async (user_id, settings) => {
    return await db.run(`
        UPDATE user_settings 
        SET notification_interval = ?, is_notification = ?, authuser = ?
        WHERE user_id = ?`,
        settings.notification_interval, settings.is_notification, settings.authuser, user_id);
}

const removeUserSettings = async (user_id) => {
    return db.run('DELETE FROM user_settings WHERE user_id = ?', user_id);
}

const markEventAsNotified = async (user_id, event) => {
    return db.run('INSERT INTO notified_events (user_id, event_id, summary, start_date, end_date, date_time_zone) VALUES (?, ?, ?, ?, ?, ?)',
        user_id, event.id, event.summary, event.start.dateTime, event.end.dateTime, event.start.timeZone);
}

const getUserNotifiedEvents = async (user_id) => {
    return db.all('SELECT * FROM notified_events WHERE user_id = ? AND is_logged = 0', user_id);
}

const checkIfEventWasNotified = async (user_id, event_id) => {
    const event = await db.get('SELECT * FROM notified_events WHERE user_id = ? AND event_id = ?', user_id, event_id);
    return event !== undefined;
}

const removeNotifiedEvents = async () => {
    return db.run('DELETE FROM notified_events');
}

const setNotifiedEventAsLogged = async (id) => {
    return db.run('UPDATE notified_events SET is_logged = 1 WHERE id = ?', id);
}

module.exports = {
    getAllUsers,
    getUser,
    createUser,
    updateUser,
    removeUser,
    getUserSettings,
    updateUserSettings,
    removeUserSettings,
    getUserNotifiedEvents,
    markEventAsNotified,
    checkIfEventWasNotified,
    removeNotifiedEvents,
    setNotifiedEventAsLogged,
};