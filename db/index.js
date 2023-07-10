const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const util = require('util');
const dbPath = path.resolve(__dirname, 'database.db');

const db = new sqlite3.Database(dbPath);
db.all = util.promisify(db.all);

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

module.exports = db;