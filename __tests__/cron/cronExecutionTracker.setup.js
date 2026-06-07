jest.mock('../../db/models/cronJobState', () => ({
    upsertLastSuccess: jest.fn().mockResolvedValue(undefined),
    getLastSuccessByKeys: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const cronJobState = require('../../db/models/cronJobState');
const logger = require('../../logger');

beforeEach(() => {
    jest.clearAllMocks();
});

module.exports = { cronJobState, logger };
