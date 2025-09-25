const { getPost, deletePost } = require('../mattermost/utils');
const logger = require('../logger');

module.exports = async ({ post_id }) => {
    try {
        const post = await getPost(post_id);
        if (post.root_id) {
            await deletePost(post.root_id);
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}
