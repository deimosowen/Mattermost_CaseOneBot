const { postMessage, postMessageInTreed } = require('../mattermost/utils');
const JiraService = require('../services/jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const { isToDoStatus, isInProgressStatus } = require('../services/jiraService/jiraHelper');
const { INREVIEW_CHANNEL_IDS } = require('../config');
const logger = require('../logger');
const resources = require('../resources');

module.exports = async ({ post_id, channel_type, user_name, args }) => {
    try {
        const [taskKey, mergeRequest] = args;

        if (channel_type !== 'D') {
            const message = resources.onlyDirectMessagesCommand;
            postMessageInTreed(post_id, message);
            return;
        }

        const task = await JiraService.fetchTask(taskKey);
        const message = prepareMessage(task, mergeRequest, user_name);

        if (isToDoStatus(task.status) || isInProgressStatus(task.status)) {
            await JiraService.changeTaskStatus(taskKey, JiraStatusType.INREVIEW);
        }

        postMessage(INREVIEW_CHANNEL_IDS[0], message);
    } catch (error) {
        logger.error(error);
    }
}

const prepareMessage = (task, mergeRequest, user_name) => {
    let message = `**${JiraStatusType.INREVIEW.toUpperCase()}** [${task.key}](https://jira.parcsis.org/browse/${task.key}) ${task.summary}`;

    if (mergeRequest) {
        message += `\n[${mergeRequest}](${mergeRequest})`;
    } else if (task.pullRequests && task.pullRequests.length === 1) {
        const pullRequestsUrl = task.pullRequests[0].url;
        message += `\n[${pullRequestsUrl}](${pullRequestsUrl})`;
    }

    message += `\nАвтор: ${user_name}`;

    return message;
};
