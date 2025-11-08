const GitlabService = require('./gitlabService');
const { addFeatureReady } = require('../db/models/featureReady');
const { postMessage, postMessageInTreed, pinPost } = require('../mattermost/utils');
const { parseGitlabMrUrl } = require('../services/gitlabService/gitlabHelper');
const { tryResolveBackendConflicts: resolveConflicts } = require('../services/gitlabService/conflictResolver');
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
                { tag: '@c1-back', url: data.backPullRequestUrl, data: parseGitlabMrUrl(data.backPullRequestUrl) },
                { tag: '@c1-front', url: data.frontPullRequestUrl, data: parseGitlabMrUrl(data.frontPullRequestUrl) },
                { tag: '@c1-aqa', url: data.aqaPullRequestUrl, data: parseGitlabMrUrl(data.aqaPullRequestUrl) }
            ].filter(p => p.url);

            await this._saveToDatabase(data, mergeRequests, post.id);

            const conflictResults = await this._checkMergeConflicts(mergeRequests);
            if (conflictResults.hasConflicts) {
                // Пытаемся автоматически разрешить конфликты для бэка
                await this._tryResolveBackendConflicts(mergeRequests, post.id);

                // Синхронизируем флаг autoResolved из mergeRequests в conflictResults.details
                this._syncAutoResolvedFlag(mergeRequests, conflictResults);

                const conflictMessage = this._buildConflictAlert(conflictResults);
                if (conflictMessage) {
                    await postMessageInTreed(post.id, conflictMessage);
                }
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
        await addFeatureReady(data, mergeRequests, postId);
    }

    async _checkMergeConflicts(mergeRequests) {
        const results = { hasConflicts: false, details: [] };

        for (const mr of mergeRequests) {
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

    /**
     * Синхронизирует флаг autoResolved из mergeRequests в conflictResults.details
     * @param {Array} mergeRequests - Массив merge requests с установленным autoResolved
     * @param {Object} conflictResults - Результаты проверки конфликтов
     */
    _syncAutoResolvedFlag(mergeRequests, conflictResults) {
        for (const mr of mergeRequests) {
            if (mr.autoResolved) {
                const detail = conflictResults.details.find(d => d.tag === mr.tag || d.url === mr.url);
                if (detail) {
                    detail.autoResolved = true;
                }
            }
        }
    }

    _buildConflictAlert(conflictResults) {
        const conflicted = conflictResults.details.filter(d => d.hasConflicts && !d.autoResolved);
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

    /**
     * Пытается автоматически разрешить конфликты для бэка
     * @param {Array} mergeRequests - Массив merge requests
     * @param {string} postId - ID поста в Mattermost
     */
    async _tryResolveBackendConflicts(mergeRequests, postId) {
        let resolvedAny = false;
        const allResolvedFiles = [];

        for (const mr of mergeRequests) {
            try {
                const result = await resolveConflicts({
                    project: mr.data.project,
                    mrIid: mr.data.mrIid,
                    tag: mr.tag,
                    url: mr.url
                });

                if (result.resolved && result.files.length > 0) {
                    resolvedAny = true;
                    allResolvedFiles.push(...result.files);

                    // Помечаем MR как автоматически разрешенный
                    mr.autoResolved = true;
                }
            } catch (error) {
                logger.error(`[FeatureService] Ошибка при попытке разрешения конфликтов для ${mr.tag}: ${error.message}`);
            }
        }

        // Отправляем сообщение о разрешенных конфликтах
        if (resolvedAny) {
            const filesList = allResolvedFiles.map(f => `- ${f}`).join('\n');
            const message = `✅ Автоматически разрешены конфликты FrontendVersion в файлах:\n${filesList}`;
            await postMessageInTreed(postId, message);
        }
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