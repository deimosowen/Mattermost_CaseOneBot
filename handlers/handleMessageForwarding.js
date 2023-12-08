const { postMessage, getTeam } = require('../mattermost/utils');
const { getSourceChannelId, addProcessedMessage, isMessageProcessed } = require('../db/models/forward');
const { getCurrentDuty } = require('../db/models/duty');
const { API_BASE_URL } = require('../config');
const logger = require('../logger');

module.exports = async (post, eventData) => {
    try {
        if (post.props.from_bot || post.root_id || post.type !== '') {
            return;
        }
        const currentMapping = await getSourceChannelId(post.channel_id);
        if (!currentMapping) {
            return;
        }
        if (await isMessageProcessed(post.id)) {
            return;
        }

        const filledMessage = await fillTemplate(currentMapping, post, eventData);
        const message = filledMessage || '';
        postMessage(currentMapping.target_channel_id, message);
        await addProcessedMessage(post.channel_id, eventData.channel_name, post.user_id, eventData.sender_name, post.id);
        if (currentMapping.thread_message) {
            postMessage(post.channel_id, currentMapping.thread_message, post.id);
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

async function fillTemplate(currentMapping, post, eventData) {
    let template = currentMapping.message;
    const matches = Array.from(template.matchAll(/\{(.*?)\}/g));
    for (let match of matches) {
        const paramName = match[1];
        let replacement = match[0];
        if (tagHandlers[paramName]) {
            replacement = await tagHandlers[paramName](currentMapping, post);
        } else if (post[paramName]) {
            replacement = post[paramName];
        } else if (eventData[paramName]) {
            replacement = eventData[paramName];
        }
        template = template.replace(match[0], replacement);
    }
    return template;
}

const tagHandlers = {
    'current_duty': async (currentMapping, post) => {
        const currentDuty = await getCurrentDuty(currentMapping.target_channel_id);
        if (currentDuty && currentDuty.user_id) {
            return `${currentDuty.user_id}`;
        }
        return '';
    },
    'post_link': async (currentMapping, post) => {
        const team = await getTeam();
        return `https://${API_BASE_URL}/${team.name}/pl/${post.id}`;
    }
};