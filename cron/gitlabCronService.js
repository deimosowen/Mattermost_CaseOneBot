const BaseCronService = require('./baseCronService');
const { getMergeRequestsByOpenStatuses } = require('../db/models/gitlab');
const { getReviewTaskByGitlabMergeRequestId } = require('../db/models/reviewTask');
const { postMessageInTreed, addReaction } = require('../mattermost/utils');
const GitlabService = require('../services/gitlabService');
const logger = require('../logger');

class GitlabCronService extends BaseCronService {
    constructor() {
        super('GitlabCron');
        this.gitlab = GitlabService;
        this.shedule = '*/5 * * * *';
        this.statuses = GitlabService.STATUSES;
        this.reaction = 'heavy_check_mark';
    }

    async loadJobsFromDb() {
        this.createJob('mr_polling', this.shedule, async () => {
            const mergeRequests = await getMergeRequestsByOpenStatuses();
            if (!mergeRequests.length) {
                return;
            }

            for (const mergeRequest of mergeRequests) {
                try {
                    const mr = await this.gitlab.getMergeRequestStatus(mergeRequest.project_id, mergeRequest.mr_iid);
                    if (!mr) continue;

                    if (mr.status !== mergeRequest.status) {
                        await this.gitlab.updateReviewTaskStatus(mergeRequest.id, mr.status);

                        const reviewTask = await getReviewTaskByGitlabMergeRequestId(mergeRequest.id);
                        if (reviewTask) {
                            const message = this._formatStatusMessage(mr.status);
                            await postMessageInTreed(reviewTask.post_id, message);

                            if (mr.status === this.statuses.APPROVED) {
                                await addReaction(reviewTask.post_id, this.reaction);
                            }
                        }
                    }
                } catch (error) {
                    logger.error(`[GitlabCron] Ошибка polling MR ${mergeRequest.mr_iid}: ${error.message}`);
                }
            }
        });
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

module.exports = GitlabCronService;
