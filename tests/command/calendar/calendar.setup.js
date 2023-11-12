const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { postMessageInTreed, getUserByUsername } = require('../../../mattermost/utils');
const { getUser } = require('../../../db/models/calendars');
const resources = require('../../../resources.json').calendar;
const logger = require('../../../logger');

jest.mock('googleapis', () => ({
    google: {
        calendar: jest.fn().mockReturnValue({
            events: {
                insert: jest.fn()
            }
        })
    }
}));

jest.mock('google-auth-library', () => ({
    OAuth2Client: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn()
    }))
}));

jest.mock('../../../mattermost/utils', () => ({
    postMessageInTreed: jest.fn(),
    getUserByUsername: jest.fn()
}));

jest.mock('../../../db/models/calendars', () => ({
    getUser: jest.fn()
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
    google,
    OAuth2Client,
    postMessageInTreed,
    getUserByUsername,
    getUser,
    resources,
    logger,
};