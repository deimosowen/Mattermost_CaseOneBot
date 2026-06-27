const { getPost, postMessageInTreed } = require('../mattermost/utils');
const flakyTest = require('../services/flakyTest');
const logger = require('../logger');

module.exports = async ({ post_id, args }) => {
    try {
        const [mergeRequestUrl] = args || [];
        if (!mergeRequestUrl) {
            await postMessageInTreed(post_id, 'Передай ссылку на GitLab MR: `!flaky-check https://gitlab.../-/merge_requests/123`');
            return;
        }

        const post = await getPost(post_id);
        const threadPostId = post.root_id || post.id;

        await flakyTest.runManualCheckForMergeRequest({
            mergeRequestUrl,
            replyPostId: post_id,
            threadPostId,
            authorUserId: post.user_id,
            channelId: post.channel_id,
        });
    } catch (error) {
        logger.error(`[FlakyCheckCommand] ${error.message}`);
        await postMessageInTreed(post_id, `Не удалось выполнить проверку: ${error.message}`);
    }
};
