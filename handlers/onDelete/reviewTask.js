const { deleteTaskReview, getReviewTaskByPostId } = require('../../db/models/reviewTask');

module.exports = async function handleReviewTaskDeletion(post) {
    const reviewTask = await getReviewTaskByPostId(post.id);
    if (!reviewTask) return;

    await deleteTaskReview(reviewTask.id);
};