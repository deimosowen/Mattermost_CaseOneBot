const BaseCronService = require('./baseCronService');
const { getFeaturesWithOpenMRs } = require('../db/models/featureReady');
const { postMessageInTreed, addReaction } = require('../mattermost/utils');
const GitlabService = require('../services/gitlabService');
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
}

module.exports = FeatureReadyCronService;