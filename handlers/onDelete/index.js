const logger = require('../../logger');

const handlers = [
    require('./forwardMessage'),
    require('./reviewTask'),
];

module.exports = async function onMessageDeleted(post, eventData) {
    for (const handler of handlers) {
        try {
            await handler(post, eventData);
        } catch (err) {
            logger.error(`Ошибка в обработчике ${handler.name}:`, err);
        }
    }
};
