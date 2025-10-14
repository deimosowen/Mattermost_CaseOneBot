const { getFeatureReadyByPostId, deleteFeatureReady } = require('../../db/models/featureReady');

module.exports = async function handleReviewTaskDeletion(post) {
    const featureReady = await getFeatureReadyByPostId(post.id);
    if (!featureReady) return;

    await deleteFeatureReady(featureReady.id);
};