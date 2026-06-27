const JiraService = require('../jiraService');
const { FLAKY_STABILIZATION_TASK_KEY } = require('../../config');
const { normalizeTestIdentity, getShortTestName } = require('./testIdentity');
const logger = require('../../logger');

function scoreTask(testName, issue) {
    const full = normalizeTestIdentity(testName);
    const short = normalizeTestIdentity(getShortTestName(testName));
    const haystack = normalizeTestIdentity(`${issue.summary || ''}\n${issue.description || ''}`);

    if (!haystack) {
        return 0;
    }
    if (full && haystack.includes(full)) {
        return 1;
    }
    if (short && short.length >= 8 && haystack.includes(short)) {
        return 0.8;
    }

    const tokens = full.split(/[ ._-]+/).filter((token) => token.length >= 6);
    if (!tokens.length) {
        return 0;
    }

    const matched = tokens.filter((token) => haystack.includes(token)).length;
    return matched / tokens.length;
}

async function findKnownStabilizationTask(testName) {
    try {
        const jql = `"Epic Link" = ${FLAKY_STABILIZATION_TASK_KEY}`;
        const issues = await JiraService.searchTasksByJql(jql, 100);
        let best = null;

        for (const issue of issues || []) {
            const score = scoreTask(testName, issue);
            if (!best || score > best.score) {
                best = { issue, score };
            }
        }

        if (best && best.score >= 0.65) {
            return {
                key: best.issue.key,
                summary: best.issue.summary,
                score: best.score,
            };
        }

        return null;
    } catch (error) {
        logger.warn(`[FlakyJiraMatcher] Failed to search ${FLAKY_STABILIZATION_TASK_KEY}: ${error.message}`);
        return null;
    }
}

module.exports = {
    findKnownStabilizationTask,
    scoreTask,
};
