const { getTask, changeStatus, addComment, setReviewers, searchTasks, getSubtasks, getIssueWorklogs, getWorklogReport } = require('../../jira');
const { JIRA_BOT_USERNAME, JIRA_BOT_PASSWORD } = require('../../config');

class JiraService {
    constructor() {
        this.authHeader = `Basic ${btoa(`${JIRA_BOT_USERNAME}:${JIRA_BOT_PASSWORD}`)}`;
    }

    async fetchTask(taskKey) {
        return await getTask(taskKey, this.authHeader);
    }

    async fetchTaskParent(taskKey) {
        return await getTaskParent(taskKey, this.authHeader);
    }

    async changeTaskStatus(taskKey, status) {
        return await changeStatus(taskKey, status, this.authHeader);
    }

    async addComment(taskKey, comment) {
        return await addComment(taskKey, comment, this.authHeader);
    }

    async setReviewers(taskKey, reviewers) {
        return await setReviewers(taskKey, reviewers, this.authHeader);
    }

    async searchTasksByJql(jql, maxResults = 50) {
        return await searchTasks(jql, maxResults, this.authHeader);
    }

    async fetchSubtasks(taskKey) {
        return await getSubtasks(taskKey, this.authHeader);
    }

    async fetchIssueWorklogs(taskKey) {
        return await getIssueWorklogs(taskKey, this.authHeader);
    }

    async fetchWorklogReport(data) {
        return await getWorklogReport(data, this.authHeader);
    }
}

module.exports = new JiraService();
