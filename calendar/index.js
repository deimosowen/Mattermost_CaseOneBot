const moment = require('moment-timezone');
const { postMessage, getUser } = require('../mattermost/utils');
const { google } = require('googleapis');
const { isLoad, getOAuth2ClientForUser } = require('../server/googleAuth');
const { CronJob } = require('../cron');
const { getAllUsers, markEventAsNotified, checkIfEventWasNotified,
    removeNotifiedEvents, removeUser, removeUserSettings } = require('../db/models/calendars');
const logger = require('../logger');
const TurndownService = require('turndown');
const turndownService = new TurndownService();

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
        const userOAuth2Client = await getOAuth2ClientForUser(user.user_id);
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
                const eventStartTime = moment(event.start.dateTime);
                const attendanceStatus = event.attendees ? event.attendees.find(att => att.email === mattermostUser.email)?.responseStatus : null;
                if (attendanceStatus === 'declined') {
                    return;
                }
                if (eventStartTime.isAfter(now) && !(await checkIfEventWasNotified(user.user_id, event.id))) {
                    const message = createEventMessage(event, timezone, user);
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
        const userOAuth2Client = await getOAuth2ClientForUser(user_id);
        const calendar = google.calendar({ version: 'v3', auth: userOAuth2Client });
        const res = await calendar.events.get({
            calendarId: 'primary',
            eventId: event_id,
        });
        return res.data;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

function createEventMessage(event, userTimeZone, user) {
    try {
        const authuser = user.authuser || 0;
        const eventDate = moment(event.start.dateTime || event.start.date).tz(userTimeZone);
        const description = event.description ? `${turndownService.turndown(event.description)}\n` : '';
        const hangoutLink = event.hangoutLink ? `[Присоединиться к Google Meet](${event.hangoutLink}?authuser=${authuser})` : '';
        return `
**${event.summary}**
*${eventDate.format('LLL')}*\n
${description}
${hangoutLink}`;
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}

module.exports = {
    initGoogleCalendarNotifications,
    getEventById,
};