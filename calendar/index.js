const moment = require('moment-timezone');
const { postMessage, getUser } = require('../mattermost/utils');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { client_id, client_secret, redirect_uris } = require('../credentials.json').web;
const { CronJob } = require('../cron');
const { getAllUsers, markEventAsNotified, checkIfEventWasNotified, removeNotifiedEvents } = require('../db/models/calendars');
const logger = require('../logger');
const TurndownService = require('turndown');
const turndownService = new TurndownService();

const initGoogleCalendarNotifications = async () => {
    const notificationsCronJob = new CronJob('* * * * *', async () => {
        await notifyUsersAboutUpcomingEvents();
    }, null, true, 'UTC');

    const cleanupCronJob = new CronJob('0 0 * * *', async () => {
        await removeNotifiedEvents();
    }, null, true, 'UTC');

    notificationsCronJob.start();
    cleanupCronJob.start();
};

const notifyUsersAboutUpcomingEvents = async () => {
    const users = await getAllUsers();
    for (const user of users) {
        await listEventsForUser(user);
    }
};

async function listEventsForUser(user) {
    const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(user);
    const mattermostUser = await getUser(user.user_id);
    const timezone = mattermostUser.timezone.useAutomaticTimezone === 'true' ? mattermostUser.timezone.automaticTimezone : mattermostUser.timezone.manualTimezone;
    const now = moment().tz(timezone);
    const tenMinutesFromNow = now.clone().add(user.notification_interval + 1, 'minutes');
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    try {
        const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: now.toISOString(),
            timeMax: tenMinutesFromNow.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });
        const events = res.data.items;
        if (events.length) {
            for (const event of events) {
                const eventStartTime = moment(event.start.dateTime);
                const attendanceStatus = event.attendees ? event.attendees.find(att => att.email === user.email)?.responseStatus : null;
                if (attendanceStatus === 'declined') {
                    continue;
                }
                if (eventStartTime.isAfter(now) && !(await checkIfEventWasNotified(user.user_id, event.id))) {
                    const message = createEventMessage(event, timezone);
                    postMessage(user.channel_id, message);
                    await markEventAsNotified(user.user_id, event.id);
                }
            }
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}

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

module.exports = {
    initGoogleCalendarNotifications,
};