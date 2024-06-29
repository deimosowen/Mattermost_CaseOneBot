const handleQuestion = require('./handleQuestion');
const handleMessageForwarding = require('./handleMessageForwarding');
const handlePostDeleted = require('./handlePostDeleted');
const handleTaskInReview = require('./handleTaskInReview');

module.exports = {
    handleMessageForwarding,
    handleQuestion,
    handlePostDeleted,
    handleTaskInReview,
};