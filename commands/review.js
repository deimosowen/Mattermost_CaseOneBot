const { getPost, postMessage, postMessageInTreed, getChannelMembers } = require('../mattermost/utils');
const { getReviewTaskByKey, getReviewTaskByPostId, addReviewTask, updateReviewTaskStatus, addTaskNotification } = require('../db/models/reviewTask');
const JiraService = require('../services/jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const { isToDoStatus, isInProgressStatus } = require('../services/jiraService/jiraHelper');
const { INREVIEW_CHANNEL_IDS } = require('../config');
const logger = require('../logger');

module.exports = async ({ post_id, user_id, user_name, args }) => {
    try {
        const [taskKey, mergeRequest, reviewer] = args;

        const reviewTask = taskKey === null
            ? await getReviewTask(post_id)
            : await getReviewTaskByKey(taskKey);

        if (taskKey === null && reviewTask === null) {
            await postMessageInTreed(post_id, `Не удалось найти задачу для перевода в статус **${JiraStatusType.INREVIEW}**. Укажите task_key или убедитесь, что задача уже существует.`);
            return;
        }

        const key = taskKey || reviewTask.task_key;
        const task = await JiraService.fetchTask(key);
        const message = prepareMessage(task, mergeRequest, user_name, reviewer);

        for (const channelId of INREVIEW_CHANNEL_IDS) {
            const isExistsChannel = await getChannelUserExists(channelId, user_id);
            if (!isExistsChannel) {
                return;
            }

            if (isToDoStatus(task.status) || isInProgressStatus(task.status)) {
                await JiraService.changeTaskStatus(key, JiraStatusType.INREVIEW);
            }

            if (reviewTask) {
                let repeatedReviewMessage = `Задача снова переведена в статус **${JiraStatusType.INREVIEW}**.`;
                if (reviewTask.reviewer || reviewTask.reviewer !== null) {
                    repeatedReviewMessage += `\nРевьювер: ${reviewTask.reviewer}`;
                }

                await postMessageInTreed(reviewTask.post_id, repeatedReviewMessage);

                await updateReviewTaskStatus({
                    task_key: key,
                    status: JiraStatusType.INREVIEW
                });
            }
            else {
                const post = await postMessage(channelId, message);

                const reviewTaskId = await addReviewTask({
                    channel_id: channelId,
                    post_id: post.id,
                    user_id: user_id,
                    task_key: key,
                    merge_request_url: mergeRequest || null,
                    reviewer: reviewer || null
                });
                await addTaskNotification(reviewTaskId);
            }
        };
    } catch (error) {
        logger.error(error);
    }
}

const prepareMessage = (task, mergeRequest, user_name, reviewer) => {
    let message = `**${JiraStatusType.INREVIEW.toUpperCase()}** [${task.key}](https://jira.parcsis.org/browse/${task.key}) ${task.summary}`;

    if (mergeRequest) {
        message += `\n[${mergeRequest}](${mergeRequest})`;
    } else if (task.pullRequests && task.pullRequests.length === 1) {
        const pullRequestsUrl = task.pullRequests[0].url;
        message += `\n[${pullRequestsUrl}](${pullRequestsUrl})`;
    }

    message += `\nАвтор: ${user_name}`;

    if (reviewer || reviewer !== null) {
        message += `\nРевьювер: ${reviewer}`;
    }

    return message;
};

const getChannelUserExists = async (channelId, userId) => {
    const members = await getChannelMembers(channelId);
    return members.some(member => member.user_id === userId);
}

const getReviewTask = async (post_id) => {
    const post = await getPost(post_id);
    return await getReviewTaskByPostId(post.root_id);
}