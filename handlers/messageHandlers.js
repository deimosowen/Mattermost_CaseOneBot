const handleQuestion = require('./handleQuestion');
const handleMessageForwarding = require('./handleMessageForwarding');
const onDelete = require('./onDelete');
const handleTaskInReview = require('./handleTaskInReview');
const handleDutyTagging = require('./handleDutyTagging');

module.exports = {
    handleMessageForwarding,
    handleQuestion,
    onDelete,
    handleTaskInReview,
    handleDutyTagging,
};