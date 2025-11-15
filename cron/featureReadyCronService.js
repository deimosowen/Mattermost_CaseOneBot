const BaseCronService = require('./baseCronService');
const { getFeaturesWithOpenMRs, getFeatureReadyById } = require('../db/models/featureReady');
const { postMessageInTreed, addReaction } = require('../mattermost/utils');
const GitlabService = require('../services/gitlabService');
const JiraService = require('../services/jiraService');
const JiraStatusType = require('../types/jiraStatusTypes');
const logger = require('../logger');

class FeatureReadyCronService extends BaseCronService {
    constructor() {
        super('FeatureReadyCron');
        this.gitlab = GitlabService;
        this.shedule = '* * * * *';
        this.statuses = GitlabService.STATUSES;
        this.reaction = 'heavy_check_mark';
    }

    async loadJobsFromDb() {
        this.createJob('featureReady_polling', this.shedule, async () => {
            const feature_merge_requests = await getFeaturesWithOpenMRs();
            if (!feature_merge_requests.length) {
                return;
            }

            for (const merge_request of feature_merge_requests) {
                try {
                    const mr = await this.gitlab.getMergeRequestStatus(merge_request.project_id, merge_request.mr_iid);
                    if (!mr) continue;

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
        });
    }

    _formatStatusMessage(role, mrStatus) {
        const roleMapping = {
            '@c1-back': 'Back-End',
            '@c1-front': 'Front-End',
            '@c1-aqa': 'AQA',
        };
        const roleName = roleMapping[role] || 'Неизвестная роль';

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

            // Маппинг роли на тег в заголовке задачи
            const roleToTag = {
                '@c1-back': '[Back]',
                '@c1-front': '[Front]',
                '@c1-aqa': '[AQA]',
            };

            const expectedTag = roleToTag[merge_request.role];
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
                const roleMapping = {
                    '@c1-back': 'Back-End',
                    '@c1-front': 'Front-End',
                    '@c1-aqa': 'AQA',
                };
                const roleName = roleMapping[merge_request.role] || merge_request.role;
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