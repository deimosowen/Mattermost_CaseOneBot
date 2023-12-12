const { postMessageInTreed } = require('../mattermost/utils');
const logger = require('../logger');

module.exports = async ({ post_id }) => {
    try {
        postMessageInTreed(post_id, 'Pong');
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}
