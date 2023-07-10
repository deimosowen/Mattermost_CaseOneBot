require('dotenv').config()

const { initializeMattermost, wsClient } = require('./mattermost');
const { loadCronJobsFromDb } = require('./cron');

initializeMattermost();
loadCronJobsFromDb();