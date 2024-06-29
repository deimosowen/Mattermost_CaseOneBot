const { postMessageInTreed } = require('../mattermost/utils');
const { getTask } = require('../jira');
const logger = require('../logger');
const { INREVIEW_CHANNEL_IDS, JIRA_BOT_USERNAME, JIRA_BOT_PASSWORD } = require('../config');

module.exports = async (post, eventData) => {
    try {
        if (!checkChannel(post.channel_id)) {
            return;
        }

        const taskKey = checkAndExtractTaskNumber(post);
        if (!taskKey) {
            return;
        }

        const authHeader = btoa(`${JIRA_BOT_USERNAME}:${JIRA_BOT_PASSWORD}`);
        const task = await getTask(taskKey, `Basic ${authHeader}`);
        if (!isInReviewStatus(task.status)) {
            const message = prepareMessage(eventData, taskKey, task.status);
            postMessageInTreed(post.id, message);
        }
        return;
    } catch (error) {
        logger.error(`Error: ${error.message}\nStack trace:\n${error.stack}`);
    }
}

function prepareMessage(eventData, taskKey, currentStatus) {
    return `${eventData.sender_name}, статус задачи ${taskKey} не соответствует "In Review". Текущий статус: "${currentStatus}".`;
}

function checkChannel(channel_id) {
    return INREVIEW_CHANNEL_IDS.includes(channel_id);
}

function isInReviewStatus(status) {
    return status.toLowerCase() === 'in review'.toLowerCase();
}

function checkAndExtractTaskNumber(post) {
    const message = post.message;
    const reviewRegex = /^(?:\*\*)?IN REVIEW(?:\*\*)?/i;
    if (reviewRegex.test(message)) {
        const taskNumberRegex = /(CASEM-\d+)/i;
        const taskNumberMatch = message.match(taskNumberRegex);

        if (taskNumberMatch) {
            const taskNumber = taskNumberMatch[1];
            return taskNumber;
        } else {
            return null;
        }
    } else {
        return null;
    }
}