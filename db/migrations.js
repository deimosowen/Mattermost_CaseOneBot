const { getConfig } = require('./config');
const dbMigrate = require('db-migrate');

const config = getConfig();

const dbMigrateInstance = dbMigrate.getInstance(true, {
    config: config,
    cwd: __dirname
});

function runMigrations() {
    return dbMigrateInstance.up();
}

module.exports = runMigrations;