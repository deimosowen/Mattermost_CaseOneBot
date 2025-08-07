require('dotenv').config();
const moment = require('moment');
require('moment/locale/ru');

const { initializeMattermost } = require('./mattermost');
const { loadCronJobsFromDb, loadDutyCronJobsFromDb, startPingCronJob } = require('./cron');
const { initializeServer } = require('./server');
const CalendarManager = require('./services/yandexService/calendar');
const ReviewManager = require('./services/reviewService');
const runMigrations = require('./db/migrations');

moment.locale('ru');

runMigrations()
    .then(() => {
        initializeMattermost();
        loadCronJobsFromDb();
        loadDutyCronJobsFromDb();
        initializeServer();
        CalendarManager.init();
        ReviewManager.init();
        startPingCronJob();
    })
    .catch(err => {
        console.error('Migration error:', err);
        process.exit(1);
    });