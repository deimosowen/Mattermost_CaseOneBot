const handleQuestion = require('./handleQuestion');
const handleMessageForwarding = require('./handleMessageForwarding');
const onDelete = require('./onDelete');
const handleTaskInReview = require('./handleTaskInReview');
const handleDutyTagging = require('./handleDutyTagging');
const handleFlakyTriageResponse = require('./handleFlakyTriageResponse');

module.exports = {
    handleMessageForwarding,
    handleQuestion,
    onDelete,
    handleTaskInReview,
    handleDutyTagging,
    handleFlakyTriageResponse,
};
