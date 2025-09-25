const { deleteTaskReview, getReviewTaskByPostId } = require('../../db/models/reviewTask');
const { deleteMergeRequestById } = require('../../db/models/gitlab');

module.exports = async function handleReviewTaskDeletion(post) {
    const reviewTask = await getReviewTaskByPostId(post.id);
    if (!reviewTask) return;

    await deleteTaskReview(reviewTask.id);
    await deleteMergeRequestById(reviewTask.gitlab_merge_request_id);
};