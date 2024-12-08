const { postMessageInTreed } = require('../../mattermost/utils');
const logger = require('../../logger');
const { HOST } = require('../../config');

module.exports = async ({ post_id, user_id }) => {
    try {
        const url = `${HOST}/calendar/settings?user_id=${user_id}`;
        const message = `Для настройки календаря перейдите по [ссылке](${url})`;
        postMessageInTreed(post_id, message);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}