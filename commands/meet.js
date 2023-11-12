const { google } = require('googleapis');
const { isLoad, oAuth2Client } = require('../server/googleAuth');
const { postMessageInTreed, getUserByUsername } = require('../mattermost/utils');
const { getUser } = require('../db/models/calendars');
const logger = require('../logger');
const resources = require('../resources.json').calendar;

function parseDuration(durationString = '15m') {
    const matches = durationString.match(/^(\d+)(m|h)$/);

    if (!matches) {
        return 15 * 60 * 1000;
    }

    const value = parseInt(matches[1], 10);
    const unit = matches[2];

    switch (unit) {
        case 'm':
            return value * 60 * 1000;
        case 'h':
            return value * 60 * 60 * 1000;
        default:
            return 15 * 60 * 1000;
    }
}

async function createMeetEvent(user, summary, users, duration) {
    try {
        oAuth2Client.setCredentials(user);

        const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

        const durationInMilliseconds = parseDuration(duration);
        const eventStart = new Date();
        const eventEnd = new Date(eventStart.getTime() + durationInMilliseconds);

        const event = {
            summary: summary,
            start: {
                dateTime: eventStart.toISOString(),
                timeZone: 'UTC',
            },
            end: {
                dateTime: eventEnd.toISOString(),
                timeZone: 'UTC',
            },
            attendees: users,
            conferenceData: {
                createRequest: {
                    requestId: `mattermost-meet-${Date.now()}`,
                    conferenceSolutionKey: {
                        type: 'hangoutsMeet',
                    },
                },
            },
        };


        const { data } = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
        });

        return data.hangoutLink;
    } catch (error) {
        logger.error(`Error creating Meet event: ${error.message}`);
        throw error;
    }
}

async function prepareAttendees(userString) {
    if (!userString) {
        return [];
    }

    const userNames = userString.split(',')
        .map(user => user.trim())
        .filter(name => name.startsWith('@'));

    const attendees = [];

    for (const name of userNames) {
        const mattermostUsername = name.slice(1);
        try {
            const mattermostUser = await getUserByUsername(mattermostUsername);
            if (mattermostUser && mattermostUser.email) {
                attendees.push({
                    name: `${mattermostUser.first_name} ${mattermostUser.last_name}`,
                    email: mattermostUser.email
                });
            }
        } catch (error) {
            logger.error(`Error retrieving user ${mattermostUsername}: ${error.message}`);
        }
    }

    return attendees;
}

function prepareSummary(summary, users) {
    if (summary) {
        return summary;
    }

    if (users && users.length > 0) {
        const userNames = users.map(user => user.name).join(', ');
        return resources.meetingSummaryWithUsers.replace('{users}', userNames);
    }

    return resources.defaultMeetingSummary;
}

module.exports = async ({ user_id, post_id, args }) => {
    try {
        const [userString, summary, duration] = args;

        if (isLoad === false) {
            return;
        }

        const user = await getUser(user_id);
        if (!user) {
            postMessageInTreed(post_id, resources.notAuthorized);
            return;
        }

        const users = await prepareAttendees(userString);
        const preparedSummary = prepareSummary(summary, users);
        const meetLink = await createMeetEvent(user, preparedSummary, users, duration);
        if (meetLink) {
            postMessageInTreed(post_id, resources.meetingCreated.replace('{linkName}', meetLink).replace('{link}', meetLink));
        } else {
            postMessageInTreed(post_id, resources.errorCreatingMeeting);
        }
    } catch (error) {
        postMessageInTreed(post_id, resources.errorCreatingMeeting);
        logger.error(`Error creating Meet event: ${error.message}`);
    }
};