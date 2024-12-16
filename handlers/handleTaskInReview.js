const { postMessageInTreed } = require('../mattermost/utils');
const JiraService = require('../services/jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const { isInReviewStatus, isInProgressStatus, extractTaskNumber } = require('../services/jiraService/jiraHelper');
const logger = require('../logger');
const { INREVIEW_CHANNEL_IDS } = require('../config');

module.exports = async (post, eventData) => {
    try {
        if (!checkChannel(post.channel_id)) {
            return;
        }

        const taskKey = extractTaskNumber(post);
        if (!taskKey) {
            return;
        }

        const task = await JiraService.fetchTask(taskKey);
        if (!isInReviewStatus(task.status)) {
            let message = prepareMessage(eventData, taskKey, task.status);
            if (isInProgressStatus(task.status)) {
                await JiraService.changeTaskStatus(taskKey, JiraStatusType.INREVIEW);
                message += `\nСтатус задачи изменен на **${JiraStatusType.INREVIEW}**.`;
            }
            postMessageInTreed(post.id, message);
        }
        return;
    } catch (error) {
        logger.error(`Error: ${error.message}\nStack trace:\n${error.stack}`);
    }
}

function prepareMessage(eventData, taskKey, currentStatus) {
    return `${eventData.sender_name}, статус задачи **${taskKey}** не соответствует **${JiraStatusType.INREVIEW}**.\nТекущий статус: **${currentStatus}**.`;
}

function checkChannel(channel_id) {
    return INREVIEW_CHANNEL_IDS.includes(channel_id);
}