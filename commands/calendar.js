const { getUser } = require('../db/calendars');
const { postMessage } = require('../mattermost/utils');
const { oAuth2Client } = require('../server/googleAuth');

module.exports = async ({ channel_id, user_id }) => {
    const user = await getUser(user_id);

    if (user) {
        postMessage(channel_id, `Вы уже подключили свой Google Календарь`);
        return;
    }

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/calendar.readonly'],
        state: JSON.stringify({ channel_id: channel_id, user_id: user_id }),
    });
    postMessage(channel_id, `Пожалуйста, авторизуйте бота, перейдя по этой ссылке: ${authUrl}`);
}
