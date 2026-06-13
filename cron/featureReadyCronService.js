const BaseCronService = require('./baseCronService');
const {
    getFeaturesWithOpenMRs,
    getFeatureReadyById,
    updateMergeRequestConflictMonitoring,
} = require('../db/models/featureReady');
const { postMessageInTreed, addReaction } = require('../mattermost/utils');
const GitlabService = require('../services/gitlabService');
const JiraService = require('../services/jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const logger = require('../logger');

const CONFLICT_STATE_CONFIRMATIONS = 2;

class FeatureReadyCronService extends BaseCronService {
    constructor() {
        super('FeatureReadyCron');
        this.gitlab = GitlabService;
        this.shedule = '* * * * *';
        this.statuses = GitlabService.STATUSES;
        this.reaction = 'heavy_check_mark';
    }

    // Маппинг ролей на читаемые названия
    static ROLE_TO_NAME = {
        '@c1-back': 'Back-End',
        '@c1-front': 'Front-End',
        '@c1-aqa': 'AQA',
    };

    // Маппинг ролей на теги в заголовках задач Jira
    static ROLE_TO_TAG = {
        '@c1-back': '[Back]',
        '@c1-front': '[Front]',
        '@c1-aqa': '[AQA]',
    };

    /**
     * Получить читаемое название роли
     * @param {string} role - Роль (например, '@c1-back')
     * @returns {string} - Название роли или 'Неизвестная роль'
     */
    _getRoleName(role) {
        return FeatureReadyCronService.ROLE_TO_NAME[role] || 'Неизвестная роль';
    }

    /**
     * Получить тег для роли в заголовке задачи Jira
     * @param {string} role - Роль (например, '@c1-back')
     * @returns {string|null} - Тег или null, если роль не найдена
     */
    _getRoleTag(role) {
        return FeatureReadyCronService.ROLE_TO_TAG[role] || null;
    }

    async loadJobsFromDb() {
        this.createJob('featureReady_polling', this.shedule, async () => {
            const feature_merge_requests = await getFeaturesWithOpenMRs();
            if (!feature_merge_requests.length) {
                return;
            }

            for (const merge_request of feature_merge_requests) {
                await this._processMergeRequest(merge_request);
            }
        });
    }

    async _processMergeRequest(merge_request) {
        try {
            const mr = await this.gitlab.getMergeRequestStatus(merge_request.project_id, merge_request.mr_iid);
            if (!mr) return;

            await this._handleConflictStateChange(merge_request, {
                hasConflicts: Boolean(mr.hasConflicts),
                sourceSha: mr.sourceSha || null,
            });

            // Проверяем, изменился ли статус MR на финальный статус
            if (this.gitlab.isFinalStatus(mr.status) && merge_request.mr_status !== mr.status) {
                await this.gitlab.updateReviewTaskStatus(merge_request.merge_request_id, mr.status);

                const message = this._formatStatusMessage(merge_request.role, mr.status);
                await postMessageInTreed(merge_request.mattermost_post_id, message);

                await addReaction(merge_request.mattermost_post_id, this.reaction);

                // Закрываем соответствующие задачи на влитие
                await this._closeMergeTasks(merge_request, mr.status);
            }
        } catch (error) {
            logger.error(error);
        }
    }

    async _handleConflictStateChange(merge_request, currentState) {
        const currentHasConflicts = Boolean(currentState.hasConflicts);
        const currentSourceSha = currentState.sourceSha || null;
        const previousHasConflicts = Boolean(merge_request.has_conflicts);
        if (previousHasConflicts === currentHasConflicts) {
            await this._syncStableConflictState(merge_request, currentHasConflicts, currentSourceSha);
            return;
        }

        if (this._isTargetBranchRecalculation(merge_request, currentHasConflicts, currentSourceSha)) {
            await this._rememberSuppressedConflictState(merge_request, currentHasConflicts);
            logger.debug(`[FeatureReadyCron] Пропущено resolved-уведомление для MR ${merge_request.mr_iid}: source SHA не изменился`);
            return;
        }

        const confirmed = await this._confirmConflictStateChange(merge_request, currentHasConflicts);
        if (!confirmed) {
            return;
        }

        if (currentHasConflicts) {
            await updateMergeRequestConflictMonitoring(merge_request.feature_merge_request_id, {
                hasConflicts: true,
                conflictAnnounced: true,
                pendingHasConflicts: null,
                pendingCount: 0,
                conflictSourceSha: currentSourceSha,
            });
            const roleName = this._getRoleName(merge_request.role);
            const message = `⚠️ Обнаружены конфликты для ${roleName} Merge Request.`;
            await postMessageInTreed(merge_request.mattermost_post_id, message);
            logger.debug(`[FeatureReadyCron] Обнаружены конфликты для MR ${merge_request.mr_iid}`);
            return;
        }

        const wasAnnounced = Boolean(merge_request.conflict_announced);
        await updateMergeRequestConflictMonitoring(merge_request.feature_merge_request_id, {
            hasConflicts: false,
            conflictAnnounced: false,
            pendingHasConflicts: null,
            pendingCount: 0,
            conflictSourceSha: null,
        });

        if (!wasAnnounced) {
            logger.debug(`[FeatureReadyCron] Конфликты для MR ${merge_request.mr_iid} разрешены без уведомления: конфликт не был объявлен`);
            return;
        }

        const roleName = this._getRoleName(merge_request.role);
        const message = `✅ Конфликты для ${roleName} Merge Request были *разрешены*!`;
        await postMessageInTreed(merge_request.mattermost_post_id, message);
        logger.debug(`[FeatureReadyCron] Конфликты разрешены для ${roleName} MR ${merge_request.mr_iid}`);
    }

    _isTargetBranchRecalculation(merge_request, currentHasConflicts, currentSourceSha) {
        return Boolean(
            merge_request.has_conflicts &&
            !currentHasConflicts &&
            currentSourceSha &&
            merge_request.conflict_source_sha &&
            merge_request.conflict_source_sha === currentSourceSha
        );
    }

    async _rememberSuppressedConflictState(merge_request, currentHasConflicts) {
        const pendingRaw = merge_request.conflict_pending_has_conflicts;
        const pendingHasConflicts = pendingRaw === null || pendingRaw === undefined
            ? null
            : Boolean(pendingRaw);
        const pendingCount = Number(merge_request.conflict_pending_count) || 0;

        if (pendingHasConflicts === currentHasConflicts && pendingCount > 0) {
            return;
        }

        await updateMergeRequestConflictMonitoring(merge_request.feature_merge_request_id, {
            pendingHasConflicts: currentHasConflicts,
            pendingCount: 1,
        });
    }

    async _confirmConflictStateChange(merge_request, currentHasConflicts) {
        const pendingRaw = merge_request.conflict_pending_has_conflicts;
        const pendingHasConflicts = pendingRaw === null || pendingRaw === undefined
            ? null
            : Boolean(pendingRaw);
        const pendingCount = Number(merge_request.conflict_pending_count) || 0;

        if (pendingHasConflicts !== currentHasConflicts) {
            await updateMergeRequestConflictMonitoring(merge_request.feature_merge_request_id, {
                pendingHasConflicts: currentHasConflicts,
                pendingCount: 1,
            });
            logger.debug(`[FeatureReadyCron] Зафиксировано неподтвержденное состояние конфликтов MR ${merge_request.mr_iid}: ${currentHasConflicts}`);
            return false;
        }

        const nextCount = pendingCount + 1;
        if (nextCount < CONFLICT_STATE_CONFIRMATIONS) {
            await updateMergeRequestConflictMonitoring(merge_request.feature_merge_request_id, {
                pendingHasConflicts: currentHasConflicts,
                pendingCount: nextCount,
            });
            return false;
        }

        return true;
    }

    async _syncStableConflictState(merge_request, currentHasConflicts, currentSourceSha) {
        const pendingRaw = merge_request.conflict_pending_has_conflicts;
        const pendingCount = Number(merge_request.conflict_pending_count) || 0;
        const shouldClearPending = pendingRaw !== null && pendingRaw !== undefined || pendingCount !== 0;
        const shouldBackfillSourceSha = Boolean(
            currentHasConflicts &&
            currentSourceSha &&
            !merge_request.conflict_source_sha
        );

        if (!shouldClearPending && !shouldBackfillSourceSha) {
            return;
        }

        const updates = {};
        if (shouldClearPending) {
            updates.pendingHasConflicts = null;
            updates.pendingCount = 0;
        }
        if (shouldBackfillSourceSha) {
            updates.conflictSourceSha = currentSourceSha;
        }

        await updateMergeRequestConflictMonitoring(merge_request.feature_merge_request_id, updates);

        if (shouldClearPending) {
            logger.debug(`[FeatureReadyCron] Сброшено неподтвержденное состояние конфликтов MR ${merge_request.mr_iid}`);
        }
        if (shouldBackfillSourceSha) {
            logger.debug(`[FeatureReadyCron] Запомнен source SHA для активного конфликта MR ${merge_request.mr_iid}`);
        }
    }

    _formatStatusMessage(role, mrStatus) {
        const roleName = this._getRoleName(role);

        switch (mrStatus) {
            case this.statuses.MERGED:
                return `🎉 ${roleName} Merge Request был *влит*!`;
            case this.statuses.CLOSED:
                return `🛑 ${roleName} Merge Request был закрыт.`;
            default:
                return `ℹ️ Статус ${roleName} Merge Request изменился: ${mrStatus}`;
        }
    }

    /**
     * Закрывает задачи на влитие, соответствующие роли MR
     * @param {Object} merge_request - Данные о merge request
     * @param {string} mrStatus - Статус merge request
     */
    async _closeMergeTasks(merge_request, mrStatus) {
        try {
            // Получаем feature_ready по feature_id (fr.id из запроса)
            // merge_request содержит поля из feature_ready (fr.*)
            const featureId = merge_request.id || merge_request.feature_id;
            if (!featureId) {
                logger.warn(`[FeatureReadyCron] Не найден feature_id для merge_request`);
                return;
            }

            const feature = await getFeatureReadyById(featureId);
            if (!feature || !feature.merge_tasks) {
                return;
            }

            // Распарсиваем merge_tasks
            const mergeTasks = feature.merge_tasks_parsed;
            if (!mergeTasks || mergeTasks.length === 0) {
                return;
            }

            // Получаем тег для роли в заголовке задачи
            const expectedTag = this._getRoleTag(merge_request.role);
            if (!expectedTag) {
                return;
            }

            // Обрабатываем только если MR был влит (merged)
            if (mrStatus !== this.statuses.MERGED) {
                return;
            }

            const closedTasks = [];

            // Для каждой задачи проверяем заголовок
            for (const taskId of mergeTasks) {
                try {
                    const task = await JiraService.fetchTask(taskId);
                    if (!task || !task.summary) {
                        continue;
                    }

                    // Проверяем, содержит ли заголовок нужный тег
                    if (task.summary.includes(expectedTag)) {
                        // Закрываем задачу
                        await JiraService.changeTaskStatus(taskId, JiraStatusType.CLOSED);
                        closedTasks.push(taskId);
                        logger.debug(`[FeatureReadyCron] Закрыта задача ${taskId} (${task.summary}) для роли ${merge_request.role}`);
                    }
                } catch (error) {
                    logger.error(`[FeatureReadyCron] Ошибка при закрытии задачи ${taskId}: ${error.message}`);
                }
            }

            // Отправляем сообщение о закрытых задачах
            if (closedTasks.length > 0) {
                const roleName = this._getRoleName(merge_request.role);
                const tasksList = closedTasks.map(id => `- ${id}`).join('\n');
                const message = `✅ Закрыты задачи на влитие для ${roleName}:\n${tasksList}`;
                //await postMessageInTreed(merge_request.mattermost_post_id, message);
            }
        } catch (error) {
            logger.error(`[FeatureReadyCron] Ошибка при обработке задач на влитие: ${error.message}`);
        }
    }
}

module.exports = FeatureReadyCronService;
