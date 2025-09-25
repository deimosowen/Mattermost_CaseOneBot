const logger = require('../../../logger');
const resources = require('../../../resources/resources.json').duty;
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
const CronManager = require('../../../cron/cronManager');
const { postMessage } = require('../../../mattermost/utils');

jest.mock('cron-validator');
jest.mock('../../../db/models/duty');
jest.mock('../../../cron/cronManager');
jest.mock('../../../mattermost/utils');
jest.mock('../../../logger');

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
    postMessage,
    CronManager,
    logger,
    resources
};