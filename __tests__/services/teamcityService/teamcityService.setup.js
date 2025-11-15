// Централизованные моки для teamcityService
jest.mock('axios');
jest.mock('../../../config', () => ({
    TEAMCITY_BASE_URL: 'https://ci.example.com',
    TEAMCITY_USERNAME: 'test_user',
    TEAMCITY_PASSWORD: 'test_password'
}));
jest.mock('../../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

// Импорт после jest.mock(...)
const axios = require('axios');
const logger = require('../../../logger');

beforeEach(() => {
    jest.clearAllMocks();
});

module.exports = {
    axios,
    logger,
};

