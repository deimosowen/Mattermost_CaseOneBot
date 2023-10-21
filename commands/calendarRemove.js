const { getUser, removeUser, removeUserSettings } = require('../db/models/calendars');
const { postMessage } = require('../mattermost/utils');
const logger = require('../logger');
const resources = require('../resources.json').calendar;

module.exports = async ({ channel_id, user_id }) => {
    try {
        const user = await getUser(user_id);
        if (!user) {
            postMessage(channel_id, resources.notConnected);
            return;
        }

        await removeUser(user_id);
        await removeUserSettings(user_id);
        postMessage(channel_id, resources.disconnected);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}