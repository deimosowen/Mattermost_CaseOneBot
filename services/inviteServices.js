const { postMessageInTreed, getPost, getChannel, getChannelMembers, addToChannel, getTeam } = require('../mattermost/utils');
const logger = require('../logger');
const resources = require('../resources');
const { HOST, TEAM_CHANNEL_ID } = require('../config');

async function inviteToChannel(post_id, user_id, channel_type, args) {
    const [arg] = args;
    let channelId;
    try {
        if (!isMemberExist(user_id)) {
            postMessageInTreed(post_id, `You shall not pass! 🧙`);
        }

        if (!arg) {
            let message = `Для присоединения к каналам перейдите по [этой ссылке](${HOST}/invite?user_id=${user_id})`;
            if (channel_type !== 'D') {
                message = resources.onlyDirectMessagesCommand;
            }
            postMessageInTreed(post_id, message);
            return;
        }

        const team = await getTeam();
        if (arg.includes('/channels/')) {
            const channelName = arg.split('/channels/')[1].replace(/\/$/, "");
            channelId = (await getChannel(team.id, channelName)).id;
        } else if (arg.includes('/pl/')) {
            const postId = arg.split('/pl/')[1].replace(/\/$/, "");
            channelId = (await getPost(postId)).channel_id;
        } else {
            channelId = (await getChannel(team.id, arg)).id;
        }

        if (channelId) {
            await addToChannel(user_id, channelId);
        } else {
            postMessageInTreed(post_id, `Канал не найден.`);
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        postMessageInTreed(post_id, `Канал не найден.`);
    }
};

async function getInviteUIUrl(user_id, channel_type) {
    if (channel_type !== 'D') {
        return resources.onlyDirectMessagesCommand;
    }
    return `Для присоединения к каналам перейдите по [этой ссылке](${HOST}/invite?user_id=${user_id})`;
}

async function isMemberExist(user_id) {
    const members = await getChannelMembers(TEAM_CHANNEL_ID);
    return members.some(member => member.user_id === user_id);
}

module.exports = {
    getInviteUIUrl,
    inviteToChannel,
};