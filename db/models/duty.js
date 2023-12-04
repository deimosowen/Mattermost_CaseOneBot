const db = require('../index.js');

const getDutySchedules = async () => {
    return db.all('SELECT * FROM duty_schedule');
};

const setDutySchedule = async (channel_id, cron_schedule) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO duty_schedule (channel_id, cron_schedule)
             VALUES (?, ?)`,
            [channel_id, cron_schedule],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
};

// Получение дежурного расписания
const getDutySchedule = async (channel_id) => {
    return db.get('SELECT * FROM duty_schedule WHERE channel_id = ?', channel_id);
};

// Добавление дежурного пользователя
const addDutyUser = async (channel_id, user_id, order_number) => {
    return db.run(`
        INSERT INTO duty_list (channel_id, user_id, user_name, order_number)
        VALUES (?, ?, ?, ?)`,
        channel_id, user_id, user_id, order_number
    );
};

// Получение списка дежурных
const getDutyUsers = async (channel_id) => {
    return db.all('SELECT * FROM duty_list WHERE channel_id = ? ORDER BY order_number ASC', channel_id);
};

// Установка текущего дежурного
const setCurrentDuty = async (channel_id, user_id) => {
    return db.run(`
        INSERT OR REPLACE INTO duty_current (channel_id, user_id)
        VALUES (?, ?)`,
        channel_id, user_id
    );
};

// Получение текущего дежурного
const getCurrentDuty = async (channel_id) => {
    return db.get('SELECT * FROM duty_current WHERE channel_id = ?', channel_id);
};

const updateUserActivityStatus = async (userName, isDisabled) => {
    return db.run(`
        UPDATE duty_list 
        SET is_disabled = ?
        WHERE user_name = ?`,
        isDisabled, userName
    );
};

// Удаление дежурного расписания
const deleteDutySchedule = async (channel_id) => {
    return db.run('DELETE FROM duty_schedule WHERE channel_id = ?', channel_id);
};

// Удаление всех дежурных пользователей
const deleteAllDutyUsers = async (channel_id) => {
    return db.run('DELETE FROM duty_list WHERE channel_id = ?', channel_id);
};

// Удаление текущего дежурного
const deleteCurrentDuty = async (channel_id) => {
    return db.run('DELETE FROM duty_current WHERE channel_id = ?', channel_id);
};

module.exports = {
    getDutySchedules,
    setDutySchedule,
    getDutySchedule,
    addDutyUser,
    getDutyUsers,
    setCurrentDuty,
    getCurrentDuty,
    deleteDutySchedule,
    deleteAllDutyUsers,
    deleteCurrentDuty,
    updateUserActivityStatus,
};
