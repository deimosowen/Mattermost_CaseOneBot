const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { postMessageInTreed, getUserByUsername } = require('../../../mattermost/utils');
const { getUser, markEventAsNotified } = require('../../../db/models/calendars');
const resources = require('../../../resources/resources.json').calendar;
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

jest.mock('../../../server/googleAuth', () => ({
    isLoad: true,
    oAuth2Client: {
        setCredentials: jest.fn(),
        getToken: jest.fn().mockResolvedValue({
            access_token: "mocked_access_token",
            refresh_token: "mocked_refresh_token",
            scope: "https://www.googleapis.com/auth/calendar",
            token_type: "Bearer",
            expiry_date: 123456789
        }),
    }
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
    markEventAsNotified,
    resources,
    logger,
};