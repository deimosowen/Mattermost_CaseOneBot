const { google } = require('googleapis');
const { oAuth2Client } = require('../server/googleAuth');
const { getUser } = require('../db/models/calendars');
const logger = require('../logger');

const createEvent = async (userId, eventData) => {
    try {
        const user = await getUser(userId);
        oAuth2Client.setCredentials(user);
        const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: eventData,
            conferenceDataVersion: 1,
        });
        return response.data;
    } catch (error) {
        logger.error(`Error creating calendar event: ${error.message}`);
        throw error;
    }
}

const getEventById = async (userId, eventId) => {
    try {
        const user = await getUser(userId);
        oAuth2Client.setCredentials(user);
        const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
        const res = await calendar.events.get({
            calendarId: 'primary',
            eventId: eventId,
        });
        return res.data;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

module.exports = {
    createEvent,
    getEventById,
};
