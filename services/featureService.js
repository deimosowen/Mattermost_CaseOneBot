const GitlabService = require('./gitlabService');
const { addFeatureReady } = require('../db/models/featureReady');
const { postMessage, postMessageInTreed, pinPost } = require('../mattermost/utils');
const { parseGitlabMrUrl } = require('../services/gitlabService/gitlabHelper');
const { FEATURE_IS_READY_CHANNEL_ID } = require('../config');
const logger = require('../logger');

class FeatureServices {
    constructor() {
        this.channelId = FEATURE_IS_READY_CHANNEL_ID;
    }

    async handleFeatureReady(data) {
        try {
            this._validateData(data);

            const message = this._buildFeatureReadyMessage(data);
            const post = await postMessage(this.channelId, message);
            await pinPost(post.id);

            const mergeRequests = [
                { tag: '@c1-back', url: data.backPullRequestUrl, data: parseGitlabMrUrl(data.backPullRequestUrl), saveToDB: true },
                { tag: '@c1-front', url: data.frontPullRequestUrl, data: parseGitlabMrUrl(data.frontPullRequestUrl), saveToDB: true },
                { tag: '@c1-aqa', url: data.aqaPullRequestUrl, data: parseGitlabMrUrl(data.aqaPullRequestUrl), saveToDB: true }
            ].filter(p => p.url);

            await this._saveToDatabase(data, mergeRequests, post.id);

            const conflictResults = await this._checkMergeConflicts(mergeRequests);
            if (conflictResults.hasConflicts) {
                const conflictMessage = this._buildConflictAlert(conflictResults);
                await postMessageInTreed(post.id, conflictMessage);
            }

            return { status: 'success' };
        } catch (err) {
            logger.error(err);
            return { status: 'error', error: err.message };
        }
    }

    /* ---------------------- PRIVATE ---------------------- */
    _validateData(data) {
        if (!data.taskId) throw new Error('Отсутствует taskId');
    }

    async _saveToDatabase(data, mergeRequests, postId) {
        const savedMergeRequests = mergeRequests.filter(mr => mr.saveToDB);
        await addFeatureReady(data, savedMergeRequests, postId);
    }

    async _checkMergeConflicts(mergeRequests) {
        const results = { hasConflicts: false, details: [] };

        const savedMergeRequests = mergeRequests.filter(mr => mr.saveToDB);

        for (const mr of savedMergeRequests) {
            try {
                const { project, mrIid } = mr.data;
                const projectInfo = await GitlabService.getProjectByName(project);
                const mrInfo = await GitlabService.getMergeRequestById(projectInfo.project_id, mrIid);

                const hasConflicts = Boolean(mrInfo.hasConflicts);

                results.details.push({
                    tag: mr.tag,
                    url: mr.url,
                    title: mrInfo.title,
                    hasConflicts
                });

                if (hasConflicts) {
                    results.hasConflicts = true;
                }
            } catch (err) {
                logger.error(err);
                results.details.push({
                    tag: mr.tag,
                    url: mr.url,
                    error: err.message
                });
            }
        }

        return results;
    }

    _buildConflictAlert(conflictResults) {
        const conflicted = conflictResults.details.filter(d => d.hasConflicts);
        if (!conflicted.length) {
            return null;
        }

        const lines = conflicted.map(c => `- ${c.tag} [MR](${c.url})`);

        return [
            `:warning: **Обнаружены конфликты!**`,
            ``,
            ...lines
        ].join('\n');
    }

    _buildFeatureReadyMessage(data) {
        const {
            taskId,
            taskName,
            backPullRequestUrl,
            frontPullRequestUrl,
            aqaPullRequestUrl,
            mergeTaskId,
            description
        } = data;

        // --- helpers ---
        const jiraLink = (id) => `https://jira.parcsis.org/browse/${encodeURIComponent(id)}`;

        const normalizeMergeIds = (input) => {
            if (!input) {
                return [];
            }

            if (Array.isArray(input)) {
                return input.flatMap(v => String(v).split(/[,\s;]+/));
            }

            return String(input).split(/[,\s;]+/);
        };

        const mergeIds = normalizeMergeIds(mergeTaskId)
            .map(id => id.trim())
            .filter(Boolean);

        const mergeList = mergeIds.length
            ? mergeIds.map(id => `- [${id}](${jiraLink(id)})`).join('\n')
            : '_не указано_';

        const formatLink = (tag, title, url) => url
            ? `- ${tag} [${title}](${url})`
            : `- ~~${title}~~`;

        const lines = [];
        lines.push(`[${taskId} | ${taskName || '_без названия_'}](${jiraLink(taskId)})`);
        lines.push('');
        lines.push('**Merge Requests:**');
        lines.push(formatLink('@c1-back', 'Back-End MR', backPullRequestUrl));
        lines.push(formatLink('@c1-front', 'Front-End MR', frontPullRequestUrl));
        lines.push(formatLink('@c1-aqa', 'AQA MR', aqaPullRequestUrl));
        lines.push('');
        lines.push('**Задачи на влитие:**');
        lines.push(mergeList);
        if (description) {
            lines.push('');
            lines.push(description);
        }

        return lines.join('\n');
    }
}

module.exports = new FeatureServices();