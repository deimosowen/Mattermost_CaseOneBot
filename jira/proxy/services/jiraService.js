const JiraClient = require('jira-client');
const moment = require('moment');
const NodeCache = require('node-cache');
const axios = require('axios');
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
    try {
        let task = await jiraClient.findIssue(taskId);
        const customField = "customfield_18160";
        const confluenceURL = "customfield_12061";

        const devDetails = await jiraClient.getDevStatusDetail(task.id, 'gitlabselfmanaged', 'pullrequest');

        const allPullRequests = devDetails.detail?.[0]?.pullRequests || [];
        const openPullRequests = allPullRequests.filter(pr => pr.status === "OPEN");
        const reviewers = task.fields[customField]?.map(reviewer => ({
            name: reviewer.displayName,
            email: reviewer.emailAddress,
        }));

        // Извлекаем зависимости из issuelinks
        const issueLinks = task.fields.issuelinks || [];
        const dependencies = [];

        for (const link of issueLinks) {
            // Outward link: текущая задача зависит от другой (Зависит от)
            if (link.outwardIssue) {
                const linkTypeOutward = link.type?.outward || '';
                // Проверяем, что это связь "Зависит от" (на русском или английском)
                if (linkTypeOutward === 'Зависит от' ||
                    linkTypeOutward.toLowerCase().includes('depends') ||
                    linkTypeOutward.toLowerCase().includes('зависит')) {
                    dependencies.push({
                        key: link.outwardIssue.key,
                        summary: link.outwardIssue.fields?.summary || ''
                    });
                }
            }
        }

        const taskData = {
            key: task.key,
            summary: task.fields.summary,
            description: task.fields.description,
            status: task.fields.status.name,
            created: task.fields.created,
            updated: task.fields.updated,
            comments: task.fields.comment.comments,
            confluenceURL: task.fields[confluenceURL],
            labels: task.fields.labels,
            pullRequests: openPullRequests,
            reviewers: reviewers || [],
            fixVersions: task.fields.fixVersions || [],
            dependencies: dependencies,
        };

        return taskData;
    } catch (error) {
        // Если задача не найдена, возвращаем null вместо undefined
        if (error.message && error.message.includes('Issue Does Not Exist')) {
            return null;
        }
        // Для других ошибок пробрасываем дальше
        throw error;
    }
};

const getTaskParent = async (jiraClient, taskId) => {
    const customField = "customfield_11161";
    const confluenceURL = "customfield_12061";

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
        comments: task.fields.comment.comments,
        confluenceURL: task.fields[confluenceURL]
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

const getIssueWorklogs = async (jiraClient, taskId) => {
    return jiraClient.getIssueWorklogs(taskId, 0, 1000);
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

const setReviewers = async (jiraClient, taskId, reviewers) => {
    try {
        const customField = "customfield_18160";
        const issue = await jiraClient.findIssue(taskId);
        const currentReviewers = issue.fields[customField] || [];
        const newReviewers = reviewers.map(reviewer => ({
            emailAddress: reviewer.email
        }));
        const bodyData = {
            fields: {
                summary: "CLONE - [QA][Cases]: ТЕСТ",
                //customfield_18160: "e.rudenko",
                customfield_18160: {
                    self: 'https://jira.parcsis.org/rest/api/2/user?username=e.rudenko',
                    name: 'e.rudenko',
                    key: 'e.kiru',
                    emailAddress: 'e.rudenko@pravo.tech',
                    avatarUrls: {
                        '48x48': 'https://jira.parcsis.org/secure/useravatar?ownerId=e.kiru&avatarId=20742',
                        '24x24': 'https://jira.parcsis.org/secure/useravatar?size=small&ownerId=e.kiru&avatarId=20742',
                        '16x16': 'https://jira.parcsis.org/secure/useravatar?size=xsmall&ownerId=e.kiru&avatarId=20742',
                        '32x32': 'https://jira.parcsis.org/secure/useravatar?size=medium&ownerId=e.kiru&avatarId=20742'
                    },
                    displayName: 'Руденко Екатерина Евгеньевна',
                    active: true,
                    timeZone: 'Europe/Samara'
                }
            }
        };
        await jiraClient.updateIssue(issue.id, bodyData);
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

const mapWithConcurrency = async (items, limit, mapper) => {
    const results = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.min(Math.max(Number(limit) || 1, 1), items.length);

    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (cursor < items.length) {
            const currentIndex = cursor;
            cursor += 1;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }));

    return results;
};

const getJiraBaseUrl = (jiraClient) => {
    const host = process.env.JIRA_HOST || jiraClient?.host || '';
    if (!host) {
        throw new Error('JIRA_HOST is required for Tempo worklog report');
    }
    return host.startsWith('http') ? host : `https://${host}`;
};

const createJiraRestClient = (authHeader, jiraClient) => axios.create({
    baseURL: getJiraBaseUrl(jiraClient),
    timeout: Number(process.env.WORKLOG_REPORT_TEMPO_TIMEOUT_MS || 60000),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
    },
});

const normalizeDate = (value) => {
    if (!value) return null;
    const parsed = moment.parseZone(value, ['YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss.SSS', moment.ISO_8601], true);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : String(value).slice(0, 10);
};

const getTempoWorklogSeconds = (worklog) => Number(worklog?.timeSpentSeconds || worklog?.timeSpent || 0);

const resolveJiraUsersForTempo = async (client, users) => {
    const concurrency = parseInt(process.env.WORKLOG_REPORT_TEMPO_USER_CONCURRENCY || '6', 10) || 6;
    const resolved = [];

    await mapWithConcurrency(users, concurrency, async (user) => {
        const values = new Set([user.username, user.email, user.id].filter(Boolean).map((value) => String(value)));
        let jiraUser = null;

        try {
            const response = await client.get('/rest/api/2/user', {
                params: { username: user.username },
            });
            jiraUser = response.data;
        } catch (error) {
            jiraUser = null;
        }

        if (jiraUser) {
            [jiraUser.name, jiraUser.key, jiraUser.emailAddress, jiraUser.accountId]
                .filter(Boolean)
                .forEach((value) => values.add(String(value)));
        }

        resolved.push({
            ...user,
            tempoWorkers: [...values],
            primaryTempoWorker: String(jiraUser?.key || jiraUser?.name || user.username),
        });
    });

    return resolved;
};

const buildTempoUserMap = (users) => {
    const map = new Map();
    for (const user of users) {
        for (const value of user.tempoWorkers || []) {
            map.set(String(value).toLowerCase(), user);
        }
    }
    return map;
};

const getWorklogReport = async (jiraClient, { users, startDate, endDate }, authHeader) => {
    const startedAt = Date.now();
    const normalizedUsers = (users || []).filter((user) => user?.username);
    const hoursByUser = {};
    for (const user of normalizedUsers) {
        hoursByUser[user.username] = {};
    }

    if (!normalizedUsers.length || !startDate || !endDate) {
        return { hoursByUser, issueCount: 0, worklogCount: 0, timings: { totalMs: Date.now() - startedAt } };
    }

    if (!authHeader) {
        throw new Error('Tempo worklog report requires Jira authorization header');
    }

    const client = createJiraRestClient(authHeader, jiraClient);
    const resolveStartedAt = Date.now();
    const resolvedUsers = await resolveJiraUsersForTempo(client, normalizedUsers);
    const userMap = buildTempoUserMap(resolvedUsers);
    const workers = [...new Set(resolvedUsers.map((user) => user.primaryTempoWorker).filter(Boolean))];
    const resolveMs = Date.now() - resolveStartedAt;

    const tempoStartedAt = Date.now();
    const response = await client.post('/rest/tempo-timesheets/4/worklogs/search', {
        from: startDate,
        to: endDate,
        worker: workers,
    });
    const tempoWorklogs = Array.isArray(response.data) ? response.data : [];
    const tempoMs = Date.now() - tempoStartedAt;
    let worklogCount = 0;

    for (const worklog of tempoWorklogs) {
        const date = normalizeDate(worklog.started || worklog.dateStarted || worklog.startDate);
        if (!date || date < startDate || date > endDate) {
            continue;
        }

        const worker = String(worklog.worker || '').toLowerCase();
        const user = userMap.get(worker);
        if (!user) {
            continue;
        }

        if (!hoursByUser[user.username][date]) {
            hoursByUser[user.username][date] = 0;
        }
        hoursByUser[user.username][date] += getTempoWorklogSeconds(worklog) / 3600;
        worklogCount += 1;
    }

    const issueKeys = new Set(tempoWorklogs.map((worklog) => worklog.issue?.key).filter(Boolean));
    return {
        hoursByUser,
        issueCount: issueKeys.size,
        worklogCount,
        source: 'tempo',
        timings: {
            resolveMs,
            tempoMs,
            totalMs: Date.now() - startedAt,
        },
    };
};

const searchTasks = async (jiraClient, jql, maxResults = 50) => {
    try {
        const result = await jiraClient.searchJira(jql, {
            maxResults,
            fields: ['key', 'summary', 'status', 'assignee']
        });

        if (!result || !result.issues) return [];

        const mappedTasks = result.issues.map(issue => {
            const assignee = issue.fields.assignee;
            return {
                key: issue.key,
                summary: issue.fields.summary,
                status: issue.fields.status.name,
                assignee: assignee ? {
                    name: assignee.displayName,
                    email: assignee.emailAddress,
                    username: assignee.name,
                    accountId: assignee.accountId
                } : null
            };
        });

        return mappedTasks;
    } catch (error) {
        // Логируем полную ошибку для отладки
        const errorInfo = {
            message: error.message,
            errorMessages: error.errorMessages,
            errors: error.errors,
            statusCode: error.statusCode,
            jql: jql
        };

        // Если есть response с деталями ошибки
        if (error.response) {
            errorInfo.responseStatus = error.response.status;
            errorInfo.responseData = error.response.data;
        }

        console.error('Error searching tasks:', JSON.stringify(errorInfo, null, 2));

        // Если есть errorMessages от Jira, логируем их отдельно
        if (error.errorMessages && Array.isArray(error.errorMessages)) {
            console.error('Jira error messages:', error.errorMessages.join(', '));
        }

        // Если есть responseData с errorMessages, логируем их
        if (error.response?.data?.errorMessages) {
            console.error('Jira API error messages:', error.response.data.errorMessages.join(', '));
        }

        return [];
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
    setReviewers,
    searchTasks,
    getIssueWorklogs,
    getWorklogReport,
};
