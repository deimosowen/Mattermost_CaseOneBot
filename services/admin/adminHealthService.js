const axios = require('axios');
const config = require('../../config');
const TeamCityService = require('../teamcityService');

function normalizeBaseUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
}

function createBasicAuthHeader(username, password) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function getHttpErrorMessage(error) {
    if (error.response) {
        const details = typeof error.response.data === 'string'
            ? error.response.data
            : error.response.data?.error || error.response.statusText;
        return `${error.response.status}${details ? `: ${details}` : ''}`;
    }
    return error.message;
}

async function runCheck(fn) {
    const start = Date.now();
    await fn();
    return { status: 'ok', ms: Date.now() - start };
}

async function checkGitlab() {
    if (!config.GITLAB_BASE_URL || !config.GITLAB_API_TOKEN) {
        return { status: 'not_configured' };
    }

    return runCheck(() => axios.get(`${normalizeBaseUrl(config.GITLAB_BASE_URL)}/api/v4/version`, {
        headers: { 'PRIVATE-TOKEN': config.GITLAB_API_TOKEN },
        timeout: 5000,
    }));
}

async function checkJira() {
    if (!config.JIRA_API_URL || !config.JIRA_BOT_USERNAME || !config.JIRA_BOT_PASSWORD) {
        return { status: 'not_configured' };
    }

    return runCheck(() => axios.get(`${normalizeBaseUrl(config.JIRA_API_URL)}/health`, {
        timeout: 5000,
        headers: {
            Authorization: createBasicAuthHeader(config.JIRA_BOT_USERNAME, config.JIRA_BOT_PASSWORD),
            'Content-Type': 'application/json',
        },
    }));
}

async function checkTeamcity() {
    if (!config.TEAMCITY_BASE_URL || !config.TEAMCITY_USERNAME || !config.TEAMCITY_PASSWORD) {
        return { status: 'not_configured' };
    }

    return runCheck(() => TeamCityService.checkConnection());
}

async function checkMattermost() {
    if (!config.API_BASE_URL || !config.BOT_TOKEN) {
        return { status: 'not_configured' };
    }

    const mmUrl = config.API_BASE_URL.startsWith('http')
        ? normalizeBaseUrl(config.API_BASE_URL)
        : `https://${normalizeBaseUrl(config.API_BASE_URL)}`;

    return runCheck(() => axios.get(`${mmUrl}/api/v4/system/ping`, {
        headers: { Authorization: `Bearer ${config.BOT_TOKEN}` },
        timeout: 5000,
    }));
}

async function safeCheck(checker) {
    try {
        return await checker();
    } catch (error) {
        return {
            status: 'error',
            message: getHttpErrorMessage(error),
        };
    }
}

async function getHealthChecks() {
    const [gitlab, jira, teamcity, mattermost] = await Promise.all([
        safeCheck(checkGitlab),
        safeCheck(checkJira),
        safeCheck(checkTeamcity),
        safeCheck(checkMattermost),
    ]);

    return {
        gitlab,
        jira,
        teamcity,
        mattermost,
    };
}

module.exports = {
    getHealthChecks,
};
