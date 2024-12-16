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

const getTask = async (jiraClient, taskId) => {
    let task = await jiraClient.findIssue(taskId);
    const taskData = {
        key: task.key,
        summary: task.fields.summary,
        description: task.fields.description,
        status: task.fields.status.name,
        created: task.fields.created,
        updated: task.fields.updated,
        comments: task.fields.comment.comments
    };
    return taskData;
};

const getTaskParent = async (jiraClient, taskId) => {
    const customField = "customfield_11161";
    let task = await jiraClient.findIssue(taskId);
    if (task.fields[customField] !== null) {
        task = await jiraClient.findIssue(task.fields[customField]);
    }
    else if (task.fields.parent) {
        task = await jiraClient.findIssue(task.fields.parent.key);
    }
    const taskData = {
        key: task.key,
        summary: task.fields.summary,
        description: task.fields.description,
        status: task.fields.status.name,
        created: task.fields.created,
        updated: task.fields.updated,
        comments: task.fields.comment.comments
    };
    return taskData;
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

const changeStatus = async (jiraClient, taskId, status) => {
    try {
        const transitions = await jiraClient.listTransitions(taskId);
        const transition = transitions.transitions.find(t => t.to.name.toLowerCase() === status.toLowerCase());

        if (!transition) {
            throw new Error(`Переход к статусу "${status}" не найден для задачи ${taskId}.`);
        }

        await jiraClient.transitionIssue(taskId, { transition: { id: transition.id } });
    } catch (error) {
        throw error;
    }
};

const addComment = async (jiraClient, taskId, comment) => {
    try {
        await jiraClient.addComment(taskId, comment);
    } catch (error) {
        throw error;
    }
};

module.exports = {
    createJiraClient,
    getTask,
    getTaskParent,
    getSubtasks,
    logTime,
    changeStatus,
    addComment,
};