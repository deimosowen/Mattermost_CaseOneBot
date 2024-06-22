const { inviteToChannel, getInviteUIUrl } = require('../services/inviteServices');
const { postMessageInTreed } = require('../mattermost/utils');
const logger = require('../logger');

module.exports = async ({ post_id, user_name, user_id, channel_type, args }) => {
    const [arg] = args;

    try {
        if (!arg) {
            const message = await getInviteUIUrl(user_id, channel_type);
            console.log(message);
            await postMessageInTreed(post_id, message);
            return;
        }

        await inviteToChannel(post_id, user_id, channel_type, args);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        await postMessageInTreed(post_id, `${user_name} Канал не найден.`);
    }
};