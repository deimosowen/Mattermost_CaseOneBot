const { postMessageInTreed } = require('../mattermost/utils');
const { oAuth2Client } = require('../server/googleAuth');
const logger = require('../logger');
const resources = require('../resources.json');

module.exports = async ({ post_id, channel_id, channel_type, user_id }) => {
    try {
        if (channel_type !== 'D') {
            postMessageInTreed(post_id, resources.onlyDirectMessagesCommand);
            return;
        }
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'],
            state: JSON.stringify({ channel_id: channel_id, user_id: user_id }),
        });
        postMessageInTreed(post_id, resources.calendar.authRequest.replace('{url}', authUrl));
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}
