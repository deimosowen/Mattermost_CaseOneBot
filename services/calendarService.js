/*const moment = require('moment-timezone');
const { google } = require('googleapis');
const { getOAuth2ClientForUser } = require('../server/googleAuth');
const { markEventAsNotified } = require('../db/models/calendars');
const logger = require('../logger');


const findEvents = async (userId, event) => {
    try {
        const userOAuth2Client = await getOAuth2ClientForUser(userId);
        const calendar = google.calendar({ version: 'v3', auth: userOAuth2Client });

        const oneYearAgo = moment().subtract(1, 'year').toISOString();
        const now = moment().toISOString();

        const res = await calendar.events.list({
            calendarId: 'primary',
            q: event,
            timeMin: oneYearAgo,
            timeMax: now,
            singleEvents: true,
            orderBy: 'startTime',
        });

        return res.data.items;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

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

const findFreeTimeSlotForGroup = async (userId, participants, duration = 30, requiredSlots = 1) => {
    try {
        const userOAuth2Client = await getOAuth2ClientForUser(userId);
        const calendar = google.calendar({ version: 'v3', auth: userOAuth2Client });

        // Текущее время в UTC
        const now = moment.utc();
        const oneWeekFromNow = now.clone().add(1, 'week');

        const items = participants.map(email => ({ id: email }));

        const res = await calendar.freebusy.query({
            requestBody: {
                timeMin: now.toISOString(),
                timeMax: oneWeekFromNow.toISOString(),
                items: items,
            },
        });

        console.log(res.data);
        const busyTimes = res.data.calendars;

        const isWeekend = date => date.isoWeekday() === 6 || date.isoWeekday() === 7;

        const freeSlots = [];
        let start = now.clone();

        // Установка начала рабочего дня на 6 утра по UTC, если текущее время раньше
        if (start.hour() < 6) {
            start = start.hour(6).minute(0).second(0).millisecond(0);
        } else if (start.hour() >= 15) {
            // Если текущее время уже после рабочего дня, переход на начало следующего дня
            start = start.add(1, 'day').hour(6).minute(0).second(0).millisecond(0);
        }

        while (start.isBefore(oneWeekFromNow) && freeSlots.length < requiredSlots) {
            if (isWeekend(start)) {
                start = start.add(1, 'day').hour(6).minute(0).second(0).millisecond(0);
                continue;
            }

            const end = start.clone().add(duration, 'minutes');
            if (start.hour() >= 15) {
                // Если конец слота выходит за пределы рабочего дня, переход на начало следующего дня
                start = start.add(1, 'day').hour(6).minute(0).second(0).millisecond(0);
                continue;
            }

            const isFree = participants.every(email => {
                const userBusyTimes = busyTimes[email].busy;
                console.log(busyTimes[email]);
                return userBusyTimes.every(interval => {
                    const busyStart = moment(interval.start);
                    const busyEnd = moment(interval.end);
                    return end.isBefore(busyStart) || start.isAfter(busyEnd);
                });
            });

            if (isFree) {
                freeSlots.push({
                    start: start.toISOString(),
                    end: end.toISOString()
                });
                start = end;
            } else {
                const nextBusyTimes = participants.flatMap(email => busyTimes[email].busy)
                    .filter(interval => moment(interval.start).isAfter(start))
                    .sort((a, b) => moment(a.start) - moment(b.start));

                if (nextBusyTimes.length > 0) {
                    start = moment(nextBusyTimes[0].end);
                    if (start.hour() < 6) {
                        start.hour(6).minute(0).second(0).millisecond(0);
                    } else if (start.hour() >= 15) {
                        start = start.add(1, 'day').hour(6).minute(0).second(0).millisecond(0);
                    }
                } else {
                    break;
                }
            }
        }

        return freeSlots;

    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        throw error;
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

const prepareAttendees = async (userString) => {
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
                    id: mattermostUser.id,
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

module.exports = {
    createEvent,
    getEventById,
    findEventByTaskNumber,
    findFreeTimeSlotForGroup,
};
*/