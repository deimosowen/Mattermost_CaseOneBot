const BaseCronService = require('./baseCronService');
const { getReviewTaskWithNotClosedMRs } = require('../db/models/reviewTask');
const { postMessageInTreed, addReaction } = require('../mattermost/utils');
const GitlabService = require('../services/gitlabService');
const reviewDistributionService = require('../services/reviewDistributionService');
const logger = require('../logger');

class ReviewCronService extends BaseCronService {
    constructor() {
        super('ReviewCron');
        this.gitlab = GitlabService;
        this.shedule = '* * * * *';
        this.statuses = GitlabService.STATUSES;
        this.reaction = 'heavy_check_mark';
        this.autoAssignment = false;
    }

    async loadJobsFromDb() {
        this.createJob('review_polling', this.shedule, async () => {
            const reviewTasks = await getReviewTaskWithNotClosedMRs();
            if (!reviewTasks.length) {
                return;
            }

            for (const reviewTask of reviewTasks) {
                try {
                    const mr = await this.gitlab.getMergeRequestStatus(reviewTask.project_id, reviewTask.mr_iid);
                    if (!mr) continue;

                    if (mr.status !== reviewTask.mr_status) {
                        await this.gitlab.updateReviewTaskStatus(reviewTask.gitlab_merge_request_id, mr.status);

                        const message = this._formatStatusMessage(mr.status);
                        await postMessageInTreed(reviewTask.post_id, message);

                        if (mr.status === this.statuses.APPROVED) {
                            await addReaction(reviewTask.post_id, this.reaction);
                        }
                    }
                } catch (error) {
                    logger.error(`[GitlabCron] Ошибка polling MR ${reviewTask.mr_iid}: ${error.message}`);
                }
            }
        });

        // Добавляем задачу для автоматического распределения ревьюеров
        if (this.autoAssignment) {
            this.createJob('review_auto_assignment', this.shedule, async () => {
                await this._processAutoReviewAssignment();
            });
        }
    }

    /**
     * Обрабатывает автоматическое назначение ревьюеров для задач без назначенного ревьюера
     */
    async _processAutoReviewAssignment() {
        try {
            const reviewTasks = await getReviewTaskWithNotClosedMRs();

            for (const reviewTask of reviewTasks) {
                // Проверяем, есть ли уже назначенный ревьюер
                if (reviewTask.reviewer) {
                    continue;
                }

                // Получаем настройки канала
                const channelSettings = await reviewDistributionService.getChannelSettings(reviewTask.channel_id);

                if (!channelSettings || !channelSettings.is_enabled) {
                    continue;
                }

                // Автоматически назначаем ревьюера
                const assignedReviewer = await reviewDistributionService.assignReviewerForTask(
                    reviewTask.channel_id,
                    reviewTask.task_key
                );

                if (assignedReviewer) {
                    logger.debug(`[ReviewCron] Автоматически назначен ревьюер ${assignedReviewer.user_name} для задачи ${reviewTask.task_key}`);
                }
            }
        } catch (error) {
            logger.error(`[ReviewCron] Ошибка автоматического назначения ревьюеров: ${error.message}`);
        }
    }

    _formatStatusMessage(mrStatus) {
        switch (mrStatus) {
            case this.statuses.APPROVED:
                return `:heavy_check_mark: Merge Request был *аппрувнут*.`;
            case this.statuses.REJECTED:
                return `❌ Merge Request *отклонён*.`;
            case this.statuses.COMMENTED:
                return `💬 В Merge Request добавлены новые комментарии.`;
            case this.statuses.MERGED:
                return `🎉 Merge Request был *влит*!`;
            case this.statuses.CLOSED:
                return `🛑 Merge Request был закрыт без merge.`;
            case this.statuses.DRAFT:
                return `📝 Merge Request переведён в *draft*.`;
            default:
                return `ℹ️ Статус Merge Request изменился: ${mrStatus}`;
        }
    }
}

module.exports = ReviewCronService;
