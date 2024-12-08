const moment = require('moment-timezone');
const db = require('../index.js');

const getAllUsers = async () => {
    return db.all(`
    SELECT c.*, s.notification_interval, s.is_notification, s.authuser, s.mattermost_token, s.dnd_mode, s.event_summary, u.login
    FROM calendars c
    LEFT JOIN user_settings s ON c.user_id = s.user_id
    LEFT JOIN user_info u ON c.user_id = u.user_id
    `);
}

const getUser = async (user_id) => {
    return db.get(`
        SELECT c.*, s.notification_interval, s.is_notification, s.authuser, u.login
        FROM calendars c
        LEFT JOIN user_settings s ON c.user_id = s.user_id
        LEFT JOIN user_info u ON c.user_id = u.user_id
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

const updateUserInfo = async (user_id, userInfo) => {
    await db.run(`
        INSERT INTO user_info (
            user_id, yandex_id, login, client_id, display_name, real_name, first_name, 
            last_name, sex, default_email, emails, birthday, 
            default_avatar_id, is_avatar_empty, psuid
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        user_id,
        userInfo.id,
        userInfo.login,
        userInfo.client_id,
        userInfo.display_name,
        userInfo.real_name,
        userInfo.first_name,
        userInfo.last_name,
        userInfo.sex,
        userInfo.default_email,
        JSON.stringify(userInfo.emails),
        userInfo.birthday,
        userInfo.default_avatar_id,
        userInfo.is_avatar_empty,
        userInfo.psuid
    );
};

const removeUser = async (user_id) => {
    return db.run('DELETE FROM calendars WHERE user_id = ?', user_id);
}

const getUserSettings = async (user_id) => {
    return db.get('SELECT * FROM user_settings WHERE user_id = ?', user_id);
}

const createUserSettings = async (user_id) => {
    return await db.run(`
    INSERT INTO user_settings (user_id, timezone, language, notification_interval, is_notification, authuser, mattermost_token, dnd_mode, event_summary) 
    VALUES (?, 'UTC', 'ru', 10, 1, 0, null, 0, null)`, user_id);
}

const updateUserSettings = async (user_id, settings) => {
    return await db.run(`
        UPDATE user_settings 
        SET notification_interval = ?, is_notification = ?, authuser = ?, mattermost_token = ?, dnd_mode = ?, event_summary = ?
        WHERE user_id = ?`,
        settings.notification_interval,
        settings.is_notification,
        settings.authuser,
        settings.mattermost_token,
        settings.dnd_mode,
        settings.event_summary,
        user_id);
}

const removeUserSettings = async (user_id) => {
    return db.run('DELETE FROM user_settings WHERE user_id = ?', user_id);
}

const markEventAsNotified = async (user_id, event) => {
    return db.run('INSERT INTO notified_events (user_id, event_id, summary, start_date, end_date, date_time_zone) VALUES (?, ?, ?, ?, ?, ?)',
        user_id, event.id, event.summary, event.start.format('YYYY-MM-DDTHH:mm:ssZ'), event.end.format('YYYY-MM-DDTHH:mm:ssZ'), event.start.tz());
}

const markStatusAsSet = async (user_id, event_id) => {
    return db.run('UPDATE notified_events SET status_set = 1 WHERE user_id = ? AND event_id = ?', user_id, event_id);
}

const getUserNotifiedEvents = async (user_id) => {
    return db.all('SELECT * FROM notified_events WHERE user_id = ? AND is_logged = 0', user_id);
}

const checkIfEventWasNotified = async (user_id, event_id) => {
    const event = await db.get('SELECT * FROM notified_events WHERE user_id = ? AND event_id = ?', user_id, event_id);
    return event !== undefined;
}

const checkIfStatusWasSet = async (user_id, event_id) => {
    const event = await db.get('SELECT * FROM notified_events WHERE user_id = ? AND event_id = ? AND status_set = 1', user_id, event_id);
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
    updateUserInfo,
    removeUser,
    getUserSettings,
    updateUserSettings,
    removeUserSettings,
    getUserNotifiedEvents,
    markEventAsNotified,
    markStatusAsSet,
    checkIfEventWasNotified,
    checkIfStatusWasSet,
    removeNotifiedEvents,
    setNotifiedEventAsLogged,
};