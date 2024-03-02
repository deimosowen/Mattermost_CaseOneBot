const JiraClient = require('jira-client');
const moment = require('moment');
const NodeCache = require('node-cache');
const cache = new NodeCache();

const createJiraClient = ({ username, password }) => {
    return new JiraClient({
        protocol: 'https',
        host: process.env.JIRA_HOST,
        username,
        password,
        apiVersion: '2',
        strictSSL: true
    });
};

const getSubtasks = async (jiraClient, taskId) => {
    const cacheKey = `subtasks-${taskId}`;
    const cachedSubtasks = cache.get(cacheKey);

    if (cachedSubtasks) {
        return cachedSubtasks;
    }
    const issue = await jiraClient.findIssue(taskId);

    const subtasks = issue.fields.subtasks.map(subtask => ({
        key: subtask.key,
        summary: subtask.fields.summary
    }));
    cache.set(cacheKey, subtasks, 86400);
    return subtasks;
};

const logTime = async (jiraClient, { taskId, started, duration, comment }) => {
    try {
        const task = await jiraClient.findIssue(taskId);
        if (!task) {
            return;
        }

        const startDateTime = moment(started).utc();
        const startedFormated = startDateTime.format('YYYY-MM-DDTHH:mm:ss.SSSZZ');
        const timeSpentSeconds = duration * 60;

        const worklog = {
            started: startedFormated,
            timeSpentSeconds: timeSpentSeconds,
            comment: comment
        };

        await jiraClient.addWorklog(taskId, worklog);
    } catch (error) {
        console.error(error);
    }
};

module.exports = {
    createJiraClient,
    getSubtasks,
    logTime
};