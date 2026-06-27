const { getMergeRequestById, updateMergeRequestStatus } = require('../db/models/gitlab');
const { getFeaturesWithOpenMRs, getFeatureReadyById, updateMergeRequestConflictMonitoring } = require('../db/models/featureReady');
const { getReviewTaskByGitlabMergeRequestId, updateReviewTaskStatus } = require('../db/models/reviewTask');
const { postMessageInTreed, addReaction } = require('../mattermost/utils');
const JiraService = require('./jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const config = require('../config');
const logger = require('../logger').child('webhook');

const FINAL_STATUSES = ['merged', 'closed'];

const STATUSES = {
    MERGED: 'merged',
    CLOSED: 'closed',
    DRAFT: 'draft',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    COMMENTED: 'commented',
};

const ROLE_TO_NAME = {
    '@c1-back': 'Back-End',
    '@c1-front': 'Front-End',
    '@c1-aqa': 'AQA',
};

const ROLE_TO_TAG = {
    '@c1-back': '[Back]',
    '@c1-front': '[Front]',
    '@c1-aqa': '[AQA]',
};

const REVIEW_STATUS_MESSAGES = {
    [STATUSES.APPROVED]: ':heavy_check_mark: Merge Request был *аппрувнут*.',
    [STATUSES.REJECTED]: '❌ Merge Request *отклонён*.',
    [STATUSES.COMMENTED]: '💬 В Merge Request добавлены новые комментарии.',
    [STATUSES.MERGED]: '🎉 Merge Request был *влит*!',
    [STATUSES.CLOSED]: '🛑 Merge Request был закрыт без merge.',
    [STATUSES.DRAFT]: '📝 Merge Request переведён в *draft*.',
    'new': '🔄 Merge Request *обновлён*.',
};

const SKIP_REVIEW_NOTIFICATIONS = ['new', 'commented'];

// Дебаунс: хранилище последних состояний конфликтов
const conflictState = new Map();

class GitlabWebhookService {
    async handleWebhook(body, headers) {
        if (!config.USE_GITLAB_WEBHOOK) {
            logger.debug('Webhook отключен (USE_GITLAB_WEBHOOK=false)');
            return;
        }

        try {
            if (body.object_kind === 'merge_request') {
                await this._handleMergeRequest(body);
            } else {
                logger.debug(`Тип: ${body.object_kind}, пропускаем`);
            }
        } catch (error) {
            logger.error(`Ошибка: ${error.message}`);
        }
    }

    async _handleMergeRequest(body) {
        const attrs = body.object_attributes;
        const projectId = body.project.id;
        const mrIid = attrs.iid;
        const hasConflicts = attrs.has_conflicts;
        const sourceSha = attrs.sha;

        logger.info(`MR !${mrIid} project=${projectId} state=${attrs.state} conflicts=${hasConflicts}`);

        const dbMr = await getMergeRequestById(projectId, mrIid);
        if (!dbMr) {
            logger.debug(`MR !${mrIid} не найден в базе`);
            return;
        }

        // Определяем статус из webhook
        const webhookStatus = this._determineStatus(attrs);
        logger.info(`MR !${mrIid} determined status: ${webhookStatus} (db status: ${dbMr.status})`);

        // Обновляем статус в базе если изменился
        if (webhookStatus && dbMr.status !== webhookStatus) {
            logger.info(`MR !${mrIid} status: ${dbMr.status} -> ${webhookStatus}`);
            await updateMergeRequestStatus(dbMr.id, webhookStatus);
        }

        // Feature Ready: уведомления и конфликты
        await this._processFeatureReady(dbMr, webhookStatus, attrs);

        // Review: уведомления о статусе
        await this._processReview(dbMr, webhookStatus);
    }

    /**
     * Определяем статус из данных webhook
     */
    _determineStatus(attrs) {
        if (attrs.draft) return STATUSES.DRAFT;

        switch (attrs.state) {
            case 'merged': return STATUSES.MERGED;
            case 'closed': return STATUSES.CLOSED;
            case 'opened':
                // Для открытых MR определяем по approved_by
                if (attrs.approvals_before_merge > 0) return STATUSES.APPROVED;
                return null;
            default: return null;
        }
    }

    // ==================== FEATURE READY ====================

    async _processFeatureReady(dbMr, status, attrs) {
        try {
            const allMrs = await getFeaturesWithOpenMRs();
            const featureMr = allMrs.find(m => m.merge_request_id === dbMr.id);
            if (!featureMr) return;

            // Уведомления о финальном статусе
            if (FINAL_STATUSES.includes(status) && featureMr.mr_status !== status) {
                const roleName = ROLE_TO_NAME[featureMr.role] || featureMr.role;
                const message = status === STATUSES.MERGED
                    ? `🎉 ${roleName} Merge Request был *влит*!`
                    : `🛑 ${roleName} Merge Request был закрыт.`;

                await postMessageInTreed(featureMr.mattermost_post_id, message);
                await addReaction(featureMr.mattermost_post_id, 'heavy_check_mark');
                logger.info(`[Feature] Уведомление: MR !${dbMr.mr_iid} -> ${status}`);

                // Закрываем задачи на влитие при merge
                if (status === STATUSES.MERGED) {
                    await this._closeMergeTasks(featureMr);
                }
            }

            // Конфликты
            await this._processConflicts(featureMr, attrs.has_conflicts, attrs.sha);
        } catch (error) {
            logger.error(`[Feature] Ошибка: ${error.message}`);
        }
    }

    /**
     * Закрытие задач на влитие в Jira при merge MR
     */
    async _closeMergeTasks(featureMr) {
        try {
            const featureId = featureMr.id || featureMr.feature_id;
            if (!featureId) return;

            const feature = await getFeatureReadyById(featureId);
            if (!feature || !feature.merge_tasks_parsed || feature.merge_tasks_parsed.length === 0) return;

            const expectedTag = ROLE_TO_TAG[featureMr.role];
            if (!expectedTag) return;

            for (const taskId of feature.merge_tasks_parsed) {
                try {
                    const task = await JiraService.fetchTask(taskId);
                    if (task && task.summary && task.summary.includes(expectedTag)) {
                        await JiraService.changeTaskStatus(taskId, JiraStatusType.CLOSED);
                        logger.info(`[Feature] Закрыта задача ${taskId} для ${featureMr.role}`);
                    }
                } catch (error) {
                    logger.error(`[Feature] Ошибка закрытия ${taskId}: ${error.message}`);
                }
            }
        } catch (error) {
            logger.error(`[Feature] Ошибка _closeMergeTasks: ${error.message}`);
        }
    }

    /**
     * Обработка конфликтов с дебаунсом
     * Требует 2 подтверждения состояния перед уведомлением
     */
    async _processConflicts(featureMr, hasConflicts, sourceSha) {
        const currentConflicts = Boolean(featureMr.has_conflicts);
        const newConflicts = Boolean(hasConflicts);

        if (currentConflicts === newConflicts) return;

        const key = `${featureMr.feature_merge_request_id}`;
        const prev = conflictState.get(key);

        // Дебаунс: если состояние совпадает с предыдущим подтверждением — инкрементируем
        if (prev && prev.conflicts === newConflicts) {
            prev.count++;
            if (prev.count < 2) {
                logger.debug(`[Feature] Дебаунс MR !${featureMr.mr_iid}: ${prev.count}/2`);
                return;
            }
            // Подтверждено — сбрасываем
            conflictState.delete(key);
        } else {
            // Новое состояние — начинаем отсчёт
            conflictState.set(key, { conflicts: newConflicts, count: 1 });
            logger.debug(`[Feature] Дебаунс MR !${featureMr.mr_iid}: 1/2`);
            return;
        }

        logger.info(`[Feature] Конфликты MR !${featureMr.mr_iid} (${featureMr.role}): ${currentConflicts} -> ${newConflicts}`);

        if (newConflicts) {
            await updateMergeRequestConflictMonitoring(featureMr.feature_merge_request_id, {
                hasConflicts: true,
                conflictAnnounced: true,
                pendingHasConflicts: null,
                pendingCount: 0,
                conflictSourceSha: sourceSha,
            });

            const roleName = ROLE_TO_NAME[featureMr.role] || featureMr.role;
            await postMessageInTreed(featureMr.mattermost_post_id,
                `⚠️ Обнаружены конфликты для ${roleName} Merge Request.`);
            logger.info(`[Feature] Конфликты объявлены для MR !${featureMr.mr_iid}`);
        } else {
            const wasAnnounced = Boolean(featureMr.conflict_announced);
            await updateMergeRequestConflictMonitoring(featureMr.feature_merge_request_id, {
                hasConflicts: false,
                conflictAnnounced: false,
                pendingHasConflicts: null,
                pendingCount: 0,
                conflictSourceSha: null,
            });

            if (wasAnnounced) {
                const roleName = ROLE_TO_NAME[featureMr.role] || featureMr.role;
                await postMessageInTreed(featureMr.mattermost_post_id,
                    `✅ Конфликты для ${roleName} Merge Request были *разрешены*!`);
                logger.info(`[Feature] Конфликты разрешены для MR !${featureMr.mr_iid}`);
            }
        }
    }

    // ==================== REVIEW ====================

    async _processReview(dbMr, status) {
        try {
            const reviewTask = await getReviewTaskByGitlabMergeRequestId(dbMr.id);
            if (!reviewTask) return;

            if (status && reviewTask.mr_status !== status) {
                logger.info(`[Review] MR !${dbMr.mr_iid} status: ${reviewTask.mr_status} -> ${status}`);
                await updateReviewTaskStatus({ status, task_key: reviewTask.task_key });

                if (!SKIP_REVIEW_NOTIFICATIONS.includes(status)) {
                    const message = REVIEW_STATUS_MESSAGES[status] || `ℹ️ Статус MR изменился: *${status}*`;
                    await postMessageInTreed(reviewTask.post_id, message);
                }

                if (status === STATUSES.APPROVED) {
                    await addReaction(reviewTask.post_id, 'heavy_check_mark');
                }

                logger.info(`[Review] Уведомление: MR !${dbMr.mr_iid} -> ${status}`);
            }
        } catch (error) {
            logger.error(`[Review] Ошибка: ${error.message}`);
        }
    }
}

module.exports = new GitlabWebhookService();
