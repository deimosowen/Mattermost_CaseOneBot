const { getPost, postMessageInTreed, } = require('../mattermost/utils');
const JiraService = require('../services/jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const { isInReviewStatus, extractTaskNumber } = require('../services/jiraService/jiraHelper');
const logger = require('../logger');

module.exports = async ({ post_id, args }) => {
    try {
        const [comment] = args;

        const post = await getPost(post_id);
        const rootPost = await getPost(post.root_id);
        const taskKey = await extractTaskNumber(rootPost);

        const task = await JiraService.fetchTask(taskKey);

        if (isInReviewStatus(task.status)) {
            await JiraService.changeTaskStatus(taskKey, JiraStatusType.TODO);

            if (comment) {
                await JiraService.addComment(taskKey, comment);
            }

            postMessageInTreed(post_id, `Статус задачи изменен на **${JiraStatusType.TODO}**.`);
            return;
        }

        postMessageInTreed(post_id, `Статус задачи **${taskKey}** не соответствует **${JiraStatusType.INREVIEW}**.\nТекущий статус: **${task.status}**.`);
    } catch (error) {
        logger.error(error);
    }
}