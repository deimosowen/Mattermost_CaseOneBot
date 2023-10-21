const { getUser } = require('../db/models/calendars');
const { postMessage } = require('../mattermost/utils');
const { oAuth2Client } = require('../server/googleAuth');
const logger = require('../logger');
const resources = require('../resources.json').calendar;

module.exports = async ({ channel_id, user_id }) => {
    try {
        const user = await getUser(user_id);
        if (user) {
            postMessage(channel_id, resources.alreadyConnected);
            return;
        }

        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: ['https://www.googleapis.com/auth/calendar.readonly'],
            state: JSON.stringify({ channel_id: channel_id, user_id: user_id }),
        });
        postMessage(channel_id, resources.authRequest.replace('{url}', authUrl));
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}
