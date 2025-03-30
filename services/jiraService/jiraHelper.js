const JiraStatusType = require('../../types/jiraStatusTypes');

function isInReviewStatus(status) {
    return status.toLowerCase() === JiraStatusType.INREVIEW.toLowerCase();
}

function isInProgressStatus(status) {
    return status.toLowerCase() === JiraStatusType.INPROGRESS.toLowerCase();
}

function isToDoStatus(status) {
    return status.toLowerCase() === JiraStatusType.TODO.toLowerCase();
}

function extractTaskNumber(post) {
    const message = post.message;
    const reviewRegex = /^(?:\*\*)?IN REVIEW(?:\*\*)?/i;
    if (reviewRegex.test(message)) {
        const taskNumberRegex = /(CASEM-\d+)/i;
        const taskNumberMatch = message.match(taskNumberRegex);

        if (taskNumberMatch) {
            const taskNumber = taskNumberMatch[1];
            return taskNumber;
        } else {
            return null;
        }
    } else {
        return null;
    }
}

module.exports = {
    isInReviewStatus,
    isInProgressStatus,
    isToDoStatus,
    extractTaskNumber
};