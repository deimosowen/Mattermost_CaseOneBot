const { getUser, removeUser } = require('../db/calendars');
const { postMessage } = require('../mattermost/utils');

module.exports = async ({ channel_id, user_id }) => {
    const user = await getUser(user_id);

    if (!user) {
        postMessage(channel_id, `Вы еще не подключили свой Google Календарь`);
        return;
    }

    await removeUser(user_id);
    postMessage(channel_id, `Вы успешно отключили свой Google Календарь`);
}