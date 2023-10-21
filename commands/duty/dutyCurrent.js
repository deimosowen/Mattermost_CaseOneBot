const { getCurrentDuty } = require('../../db/models/duty');
const { postMessage } = require('../../mattermost/utils');
const resources = require('../../resources.json').duty;

module.exports = async ({ channel_id }) => {
    try {
        const currentDuty = await getCurrentDuty(channel_id);
        if (!currentDuty) {
            postMessage(channel_id, resources.noCurrentDuty);
            return;
        }
        postMessage(channel_id, resources.currentNotification.replace('{user}', currentDuty.user_id));
    } catch (e) {
        console.log(e);
    }
}