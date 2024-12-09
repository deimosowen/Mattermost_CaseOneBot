const YandexApiManager = require('../../../services/yandexService/apiManager');
const { postMessageInTreed, getUserByUsername } = require('../../../mattermost/utils');
const { getUser, markEventAsNotified } = require('../../../db/models/calendars');
const resources = require('../../../resources/resources.json').calendar;
const logger = require('../../../logger');

jest.mock('../../../services/yandexService/apiManager', () => ({
    getApiInstance: jest.fn()
}));

jest.mock('../../../mattermost/utils', () => ({
    postMessageInTreed: jest.fn(),
    getUserByUsername: jest.fn(),
    getUser: jest.fn().mockResolvedValue({
        id: 'user_1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'user@localhost'
    })
}));

jest.mock('../../../db/models/calendars', () => ({
    getUser: jest.fn(),
    markEventAsNotified: jest.fn(),
}));

jest.mock('../../../logger', () => ({
    error: jest.fn()
}));

beforeEach(() => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2023-11-11T12:00:00.000Z'));
    jest.clearAllMocks();
});

afterEach(() => {
    jest.useRealTimers();
});

module.exports = {
    YandexApiManager,
    postMessageInTreed,
    getUserByUsername,
    getUser,
    markEventAsNotified,
    resources,
    logger,
};