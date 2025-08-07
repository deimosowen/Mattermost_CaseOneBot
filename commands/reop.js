const { getPost, postMessageInTreed, } = require('../mattermost/utils');
const { getReviewTaskByPostId, updateReviewTaskStatus } = require('../db/models/reviewTask');
const JiraService = require('../services/jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const { isInReviewStatus, extractTaskNumber } = require('../services/jiraService/jiraHelper');
const logger = require('../logger');

module.exports = async ({ post_id, user_name, args }) => {
    try {
        const [comment] = args;

        const post = await getPost(post_id);
        const rootPost = await getPost(post.root_id);
        const reviewTask = await getReviewTaskByPostId(post.root_id);
        const taskKey = reviewTask?.task_key ?? await extractTaskNumber(rootPost);
        if (!taskKey) {
            await postMessageInTreed(post_id, `Не удалось найти задачу для перевода в статус **${JiraStatusType.TODO}**. Убедитесь, что задача существует.`);
            return;
        }

        const task = await JiraService.fetchTask(taskKey);

        if (isInReviewStatus(task.status)) {
            await JiraService.changeTaskStatus(taskKey, JiraStatusType.TODO);

            if (comment) {
                await JiraService.addComment(taskKey, `[~${user_name.slice(1)}]: ${comment}`);
            }

            await postMessageInTreed(post_id, `Задача переведена в статус **${JiraStatusType.TODO}**.`);
            await updateReviewTaskStatus({
                task_key: taskKey,
                status: JiraStatusType.TODO
            });

            return;
        }

        await postMessageInTreed(post_id, `Статус задачи **${taskKey}** не соответствует **${JiraStatusType.INREVIEW}**.\nТекущий статус: **${task.status}**.`);
    } catch (error) {
        logger.error(error);
    }
}