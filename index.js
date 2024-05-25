require('dotenv').config();
const moment = require('moment');
require('moment/locale/ru');

const { initializeMattermost } = require('./mattermost');
const { loadCronJobsFromDb, loadDutyCronJobsFromDb } = require('./cron');
const { initializeServer } = require('./server');
const { initGoogleCalendarNotifications } = require('./calendar');
const runMigrations = require('./db/migrations');

moment.locale('ru');

runMigrations()
    .then(() => {
        initializeMattermost();
        loadCronJobsFromDb();
        loadDutyCronJobsFromDb();
        initializeServer();
        initGoogleCalendarNotifications();
    })
    .catch(err => {
        console.error('Migration error:', err);
        process.exit(1);
    });