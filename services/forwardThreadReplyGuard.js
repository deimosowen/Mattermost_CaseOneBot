const { getPostThread, getAllChannelMembers } = require('../mattermost/utils');
const logger = require('../logger');

async function hasTargetChannelReplyInThread(postId, targetChannelId) {
    if (!postId || !targetChannelId) {
        return false;
    }

    try {
        const [thread, members] = await Promise.all([
            getPostThread(postId),
            getAllChannelMembers(targetChannelId),
        ]);

        const targetUserIds = new Set((members || []).map((member) => member.user_id).filter(Boolean));
        if (targetUserIds.size === 0) {
            return false;
        }

        return Object.values(thread?.posts || {}).some((threadPost) => (
            threadPost.id !== postId
            && targetUserIds.has(threadPost.user_id)
        ));
    } catch (error) {
        logger.error(`[ForwardThreadReplyGuard] Ошибка проверки ответов в треде ${postId}: ${error.message}`);
        return false;
    }
}

module.exports = {
    hasTargetChannelReplyInThread,
};
