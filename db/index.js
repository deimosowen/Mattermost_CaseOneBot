const sqlite3 = require('sqlite3').verbose();
const util = require('util');
const { getDatabasePath } = require('./config');

const dbPath = getDatabasePath();
const db = new sqlite3.Database(dbPath);
db.all = util.promisify(db.all);
db.get = util.promisify(db.get);

db.run(`
    CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        message TEXT NOT NULL
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS calendars (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        scope TEXT,
        token_type TEXT,
        expiry_date INTEGER
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS notified_events (
        user_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        PRIMARY KEY (user_id, event_id)
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL,
        timezone TEXT DEFAULT 'UTC',
        language TEXT DEFAULT 'ru',
        notification_interval INTEGER DEFAULT 10
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS duty_list (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        order_number INTEGER NOT NULL
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS duty_current (
        id INTEGER PRIMARY KEY,
        channel_id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS duty_schedule (
        id INTEGER PRIMARY KEY,
        channel_id TEXT NOT NULL,
        cron_schedule TEXT NOT NULL
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS forward_channel_mapping (
        id INTEGER PRIMARY KEY,
        source_channel_id TEXT NOT NULL,
        target_channel_id TEXT NOT NULL,
        message TEXT,
        thread_message TEXT
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS forward_processed_messages (
        id INTEGER PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        message_id TEXT NOT NULL UNIQUE,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

module.exports = db;