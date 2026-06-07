const db = require('../index.js');

const getReminders = async (channel_id) => {
    let query = 'SELECT * FROM reminders';
    let params = [];

    if (channel_id) {
        query += ' WHERE channel_id = ?';
        params.push(channel_id);
    }

    return await db.all(query, params);
};

const addReminder = async (channel_id, channel_name, user_id, user_name, schedule, message, use_working_days = false) => {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO reminders (channel_id, channel_name, user_id, user_name, schedule, message, use_working_days) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [channel_id, channel_name, user_id, user_name, schedule, message, use_working_days ? 1 : 0],
            function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            }
        );
    });
};

const getReminderById = async (id) => {
    return db.get('SELECT * FROM reminders WHERE id = ?', [id]);
};

const updateReminderWorkingDays = async (id, use_working_days) => {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE reminders SET use_working_days = ? WHERE id = ?',
            [use_working_days ? 1 : 0, id],
            function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
    });
};

const deleteReminder = async (id, channel_id) => {
    return new Promise((resolve, reject) => {
        db.run(
            'DELETE FROM reminders WHERE id = ? AND channel_id = ?',
            [id, channel_id],
            function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
    });
};

module.exports = {
    getReminders,
    getReminderById,
    addReminder,
    updateReminderWorkingDays,
    deleteReminder,
};
