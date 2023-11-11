const dbMigrate = require('db-migrate').getInstance(true, {
    config: './db/database.json',
    cwd: './db'
});

function runMigrations() {
    return dbMigrate.up();
}

module.exports = runMigrations;