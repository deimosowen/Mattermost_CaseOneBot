const logger = require('../../../logger');
const resources = require('../../../resources.json').duty;
const taskType = require('../../../types/taskTypes');

jest.mock('cron-validator');
jest.mock('../../../db/models/duty');
jest.mock('../../../cron');
jest.mock('../../../mattermost/utils');
jest.mock('../../../logger');

const {
    getDutySchedule,
    setDutySchedule,
    addDutyUser,
    getDutyUsers,
    getCurrentDuty,
    setCurrentDuty,
    deleteDutySchedule,
    deleteAllDutyUsers,
    deleteCurrentDuty
} = require('../../../db/models/duty');
const { isValidCron } = require('cron-validator');
const { setCronJob, cancelCronJob } = require('../../../cron');
const { postMessage } = require('../../../mattermost/utils');

beforeEach(() => {
    jest.clearAllMocks();
});

module.exports = {
    getDutySchedule,
    setDutySchedule,
    addDutyUser,
    getDutyUsers,
    getCurrentDuty,
    setCurrentDuty,
    deleteDutySchedule,
    deleteAllDutyUsers,
    deleteCurrentDuty,
    isValidCron,
    setCronJob,
    cancelCronJob,
    postMessage,
    taskType,
    logger,
    resources
};