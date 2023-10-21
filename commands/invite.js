const { postMessage, getPost, getChannel, getChannelMembers, addToChannel } = require('../mattermost/utils');
const logger = require('../logger');
const { TEAM_CHANNEL_ID } = require('../config');

module.exports = async ({ user_name, user_id, channel_id, team_id, args }) => {
    const [arg] = args;
    let channelId;

    try {
        if (arg.includes('/channels/')) {
            const channelName = arg.split('/channels/')[1].replace(/\/$/, "");
            channelId = (await getChannel(team_id, channelName)).id;
        } else if (arg.includes('/pl/')) {
            const postId = arg.split('/pl/')[1].replace(/\/$/, "");
            channelId = (await getPost(postId)).channel_id;
        } else {
            channelId = (await getChannel(team_id, arg)).id;
        }

        if (isMemberExist(user_id)) {
            await addToChannel(user_id, channelId);
        } else {
            postMessage(channel_id, `${user_name} You shall not pass! 🧙`);
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        postMessage(channel_id, `${user_name} Канал не найден.`);
    }
};

async function isMemberExist(user_id) {
    const members = await getChannelMembers(TEAM_CHANNEL_ID);
    return members.some(member => member.user_id === user_id);
}