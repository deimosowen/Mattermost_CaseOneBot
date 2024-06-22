const moment = require('moment-timezone');
const { postMessage, getUser } = require('../mattermost/utils');
const { google } = require('googleapis');
const { isLoad, createOAuth2Client } = require('../server/googleAuth');
const { CronJob } = require('../cron');
const { getAllUsers, getUser: getUserFromCalendar,
    markEventAsNotified, checkIfEventWasNotified,
    removeNotifiedEvents, removeUser, removeUserSettings } = require('../db/models/calendars');
const logger = require('../logger');
const TurndownService = require('turndown');
const turndownService = new TurndownService();

const oAuth2ClientMap = new Map();

const initGoogleCalendarNotifications = async () => {
    if (isLoad === false) {
        return;
    }

    const notificationsCronJob = new CronJob('* * * * *', async () => {
        await notifyUsersAboutUpcomingEvents();
    }, null, true, 'UTC');

    const cleanupCronJob = new CronJob('0 22 * * 0', async () => {
        await removeNotifiedEvents();
    }, null, true, 'UTC');

    notificationsCronJob.start();
    cleanupCronJob.start();
};

const notifyUsersAboutUpcomingEvents = async () => {
    const users = await getAllUsers();
    const promises = users.map(user => notifyUser(user));
    await Promise.all(promises);
};

const notifyUser = async (user) => {
    if (user.is_notification) {
        await listEventsForUser(user);
    }
};

async function listEventsForUser(user) {
    try {
        let userOAuth2Client = oAuth2ClientMap.get(user.user_id);
        if (!userOAuth2Client) {
            userOAuth2Client = createOAuth2Client();
            userOAuth2Client.setCredentials(user);
            oAuth2ClientMap.set(user.user_id, userOAuth2Client);
        }

        const mattermostUser = await getUser(user.user_id);
        const timezone = mattermostUser.timezone.useAutomaticTimezone === 'true' ? mattermostUser.timezone.automaticTimezone : mattermostUser.timezone.manualTimezone;
        const now = moment().tz(timezone);
        const tenMinutesFromNow = now.clone().add(user.notification_interval + 1, 'minutes');
        const calendar = google.calendar({ version: 'v3', auth: userOAuth2Client });

        const res = await calendar.events.list({
            calendarId: 'primary',
            eventTypes: ['default', 'focusTime'],
            timeMin: now.toISOString(),
            timeMax: tenMinutesFromNow.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });
        const events = res.data.items;
        if (events.length) {
            const eventPromises = events.map(async (event) => {
                console.log(event);
                const eventStartTime = moment(event.start.dateTime);
                const attendanceStatus = event.attendees ? event.attendees.find(att => att.email === mattermostUser.email)?.responseStatus : null;
                if (attendanceStatus === 'declined') {
                    return;
                }
                if (eventStartTime.isAfter(now) && !(await checkIfEventWasNotified(user.user_id, event.id))) {
                    const message = createEventMessage(event, timezone);
                    await postMessage(user.channel_id, message);
                    await markEventAsNotified(user.user_id, event);
                }
            });
            await Promise.all(eventPromises);
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        //await removeUser(user.user_id);
        //await removeUserSettings(user.user_id);
    }
}

const getEventById = async (user_id, event_id) => {
    try {
        const user = await getUserFromCalendar(user_id);
        oAuth2Client.setCredentials(user);
        const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
        const res = await calendar.events.get({
            calendarId: 'primary',
            eventId: event_id,
        });
        return res.data;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

function createEventMessage(event, userTimeZone) {
    try {
        const eventDate = moment(event.start.dateTime || event.start.date).tz(userTimeZone);
        const description = event.description ? `${turndownService.turndown(event.description)}\n` : '';
        const hangoutLink = event.hangoutLink ? `[Присоединиться к Google Meet](${event.hangoutLink})` : '';
        return `
**${event.summary}**
*${eventDate.format('LLL')}*\n
${description}
${hangoutLink}`;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}

const findDemoEvents = async (user_id) => {
    try {
        const user = await getUserFromCalendar(user_id);
        oAuth2Client.setCredentials(user);
        const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

        const oneYearAgo = moment().subtract(1, 'year').toISOString();
        const now = moment().toISOString();

        const res = await calendar.events.list({
            calendarId: 'primary',
            q: 'демо',
            timeMin: oneYearAgo,
            timeMax: now,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const demoEvents = res.data.items.filter(event =>
            /демо/i.test(event.summary) // case-insensitive match for 'демо' in the event summary
        );

        return demoEvents;
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

const getDemoEventTasks = async (user_id) => {
    try {
        const events = await findDemoEvents(user_id);
        const tasks = events.map(event => {
            const taskLinks = extractTaskLinks(event.description || '');
            return {
                eventLink: event.htmlLink,
                taskLinks
            };
        });
        return tasks;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

const findEventByTaskNumber = async (user_id, taskNumber) => {
    try {
        const events = await findDemoEvents(user_id);
        for (const event of events) {
            console.log(event);
            const taskLinks = extractTaskLinks(event.description || '');
            if (taskLinks[taskNumber]) {
                return {
                    eventLink: event.htmlLink,
                    taskLink: taskLinks[taskNumber]
                };
            }
        }
        return null; // If no event is found with the given task number
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

module.exports = {
    initGoogleCalendarNotifications,
    getEventById,
    findDemoEvents,
    getDemoEventTasks,
    findEventByTaskNumber
};