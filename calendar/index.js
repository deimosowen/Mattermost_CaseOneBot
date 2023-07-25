const moment = require('moment-timezone');
const { postMessage, getUser } = require('../mattermost/utils');
const { google } = require('googleapis');
const { oAuth2Client } = require('../server/googleAuth');
const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
const { CronJob } = require('../cron');
const { getAllUsers, markEventAsNotified, checkIfEventWasNotified, removeNotifiedEvents } = require('../db/calendars');

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
        oAuth2Client.setCredentials(user);
        const mattermostUser = await getUser(user.user_id);
        await listEventsForUser(user, mattermostUser);
    }
}

async function listEventsForUser(user, mattermostUser) {
    const timezone = mattermostUser.timezone.useAutomaticTimezone === 'true' ? mattermostUser.timezone.automaticTimezone : mattermostUser.timezone.manualTimezone;
    const now = moment().tz(timezone);
    const tenMinutesFromNow = now.clone().add(11, 'minutes');
    calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: tenMinutesFromNow.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    }, async (err, res) => {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        const events = res.data.items;
        if (events.length) {
            for (const event of events) {
                const eventStartTime = moment(event.start.dateTime);
                const attendanceStatus = event.attendees.find(att => att.email === user.email)?.responseStatus;
                // Исключение событий, на которые ответили "не приду"
                if (attendanceStatus === 'declined') {
                    continue;
                }
                if (eventStartTime.isAfter(now) && !(await checkIfEventWasNotified(user.user_id, event.id))) {
                    const message = createEventMessage(event, timezone);
                    postMessage(user.channel_id, message);
                    await markEventAsNotified(user.user_id, event.id);
                    console.log(event);
                }
            }
        }
    });
}

function createEventMessage(event, userTimeZone) {
    const eventDate = moment(event.start.dateTime || event.start.date).tz(userTimeZone);
    const description = event.description ? `${event.description}\n` : '';
    const hangoutLink = event.hangoutLink ? `[Присоединиться к Google Meet](${event.hangoutLink})` : '';
    return `
**Событие: ${event.summary}**
*${eventDate.format('LLL')}*\n
${description}
${hangoutLink}`;
}

module.exports = {
    initGoogleCalendarNotifications,
};