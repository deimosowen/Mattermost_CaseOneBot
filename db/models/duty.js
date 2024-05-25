const db = require('../index.js');
const DutyType = require('../../types/dutyTypes.js');

// Получение всех дежурных расписаний
const getDutySchedules = async () => {
    return db.all('SELECT * FROM duty_schedule');
};

// Установка дежурного расписания
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
const setCurrentDuty = async (channel_id, user_id, duty_type = DutyType.REGULAR) => {
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

// Обновление статуса активности пользователя
const updateUserActivityStatus = async (id, isDisabled, returnDate) => {
    return db.run(`
        UPDATE duty_list 
        SET is_disabled = ?, return_date = ? WHERE id = ?`,
        isDisabled, returnDate, id
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

// Получение списка внеочередных дежурных
const getUnscheduledList = async (channel_id) => {
    return db.all('SELECT * FROM duty_unscheduled_list WHERE channel_id = ?', channel_id);
};

// Получение первого пользователя из списка внеочередных дежурных
const getFirstUnscheduledUser = async (channel_id) => {
    return db.get('SELECT * FROM duty_unscheduled_list WHERE channel_id = ? LIMIT 1', channel_id);
};

// Добавление пользователя в список внеочередных дежурных
const addUnscheduledUser = async (channel_id, user_id) => {
    return db.run(`
        INSERT INTO duty_unscheduled_list (channel_id, user_id)
        VALUES (?, ?)`,
        channel_id, user_id
    );
};

// Удаление пользователя из списка внеочередных дежурных
const deleteUnscheduledUser = async (id) => {
    return db.run('DELETE FROM duty_unscheduled_list WHERE id = ?', id);
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
    getUnscheduledList,
    getFirstUnscheduledUser,
    addUnscheduledUser,
    deleteUnscheduledUser,
};
