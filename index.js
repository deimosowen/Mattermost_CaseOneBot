require('dotenv').config();
const moment = require('moment');
require('moment/locale/ru');

const { initializeMattermost } = require('./mattermost');
const { loadCronJobsFromDb } = require('./cron');
const { initializeServer } = require('./server');
const { initGoogleCalendarNotifications } = require('./calendar');

initializeMattermost();
loadCronJobsFromDb();
initializeServer();
initGoogleCalendarNotifications();
moment.locale('ru');