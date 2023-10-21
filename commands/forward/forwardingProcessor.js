const { postMessage, getTeam } = require('../../mattermost/utils');
const { getSourceChannelId, addProcessedMessage, isMessageProcessed } = require('../../db/models/forward');
const { API_BASE_URL } = require('../../config');
const logger = require('../../logger');

const processForwarding = async (post, eventData) => {
    try {
        if (post.props.from_bot) {
            return;
        }
        if (post.root_id) {
            return;
        }
        if (post.props.from_bot) {
            return;
        }
        const currentMapping = await getSourceChannelId(post.channel_id);
        if (!currentMapping) {
            return;
        }
        if (await isMessageProcessed(post.id)) {
            return;
        }

        const team = await getTeam();
        const filledMessage = fillTemplate(currentMapping.message, post, eventData);
        const message = (filledMessage ? `${filledMessage}\n` : "") + `https://${API_BASE_URL}/${team.name}/pl/${post.id}`
        //Пересылка сообщения в канал
        postMessage(currentMapping.target_channel_id, message);
        //Помечаем сообщение как обработанное
        await addProcessedMessage(post.channel_id, eventData.channel_name, post.user_id, eventData.sender_name, post.id);
        //Отвечаем автору в тред, что сообщение обработано, если сообщение есть
        if (currentMapping.thread_message) {
            postMessage(post.channel_id, currentMapping.thread_message, post.id);
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

function fillTemplate(template, post, eventData) {
    if (template === null) {
        return null;
    }
    return template.replace(/\{(.*?)\}/g, (match, paramName) => {
        if (post[paramName]) {
            return post[paramName];
        }
        if (eventData[paramName]) {
            return eventData[paramName];
        }
        return match;
    });
}

module.exports = {
    processForwarding
};
