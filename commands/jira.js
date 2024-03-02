const { postMessageInTreed } = require('../mattermost/utils');
const logger = require('../logger');
const resources = require('../resources');
const { HOST } = require('../config');

module.exports = async ({ post_id, user_id, channel_type, args }) => {
    const [arg] = args;
    try {
        if (!arg) {
            let message = `Логировать время из календаря можно по [этой ссылке](${HOST}/jira?user_id=${user_id})`;
            if (channel_type !== 'D') {
                message = resources.onlyDirectMessagesCommand;
            }
            postMessageInTreed(post_id, message);
            return;
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};