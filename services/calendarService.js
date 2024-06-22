const { google } = require('googleapis');
const { getOAuth2ClientForUser } = require('../server/googleAuth');
const logger = require('../logger');

const createEvent = async (userId, eventData) => {
    try {
        const userOAuth2Client = await getOAuth2ClientForUser(userId);
        const calendar = google.calendar({ version: 'v3', auth: userOAuth2Client });
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
        const userOAuth2Client = await getOAuth2ClientForUser(userId);
        const calendar = google.calendar({ version: 'v3', auth: userOAuth2Client });
        const res = await calendar.events.get({
            calendarId: 'primary',
            eventId: eventId,
        });
        return res.data;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

const findEventByTaskNumber = async (userId, event, taskId) => {
    try {
        const events = await findEvents(userId, event);
        for (const event of events) {
            const taskLinks = extractTaskLinks(event.description || '');
            const recordingLink = getRecordingLinkFromAttachments(event.attachments || [], event.summary);
            if (taskLinks[taskId]) {
                return {
                    eventLink: event.htmlLink,
                    taskLink: taskLinks[taskId],
                    recordingLink: recordingLink
                };
            }
        }
        return null;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

const extractTaskLinks = (description) => {
    const taskPattern = /<a href="(https:\/\/jira\.parcsis\.org\/browse\/CASEM-\d+)"[^>]*>(?:<u>)?(CASEM-\d+)(?:<\/u>)?<\/a>/g;
    const taskLinks = {};
    let match;
    while ((match = taskPattern.exec(description)) !== null) {
        const [_, taskLink, taskNumber] = match;
        taskLinks[taskNumber] = taskLink;
    }
    return taskLinks;
};

const getRecordingLinkFromAttachments = (attachments, summary) => {
    for (const attachment of attachments) {
        if (attachment.title.startsWith(summary)) {
            return `https://drive.google.com/file/d/${attachment.fileId}/view`;
        }
    }
    return null;
};

module.exports = {
    createEvent,
    getEventById,
    findEventByTaskNumber,
};
