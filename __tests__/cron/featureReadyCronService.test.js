jest.mock('../../db/models/featureReady', () => ({
    getFeaturesWithOpenMRs: jest.fn(),
    getFeatureReadyById: jest.fn(),
    updateMergeRequestConflicts: jest.fn(),
}));

jest.mock('../../mattermost/utils', () => ({
    postMessageInTreed: jest.fn(),
    addReaction: jest.fn(),
}));

jest.mock('../../services/gitlabService', () => ({
    STATUSES: {
        MERGED: 'merged',
        CLOSED: 'closed',
    },
    isFinalStatus: jest.fn(),
    getMergeRequestStatus: jest.fn(),
    updateReviewTaskStatus: jest.fn(),
}));

jest.mock('../../services/jiraService', () => ({
    fetchTask: jest.fn(),
    changeTaskStatus: jest.fn(),
}));

jest.mock('../../logger', () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
}));

const FeatureReadyCronService = require('../../cron/featureReadyCronService');
const { updateMergeRequestConflicts } = require('../../db/models/featureReady');
const { postMessageInTreed } = require('../../mattermost/utils');

describe('FeatureReadyCronService conflict notifications', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new FeatureReadyCronService();
    });

    const mergeRequest = {
        feature_merge_request_id: 10,
        role: '@c1-back',
        mattermost_post_id: 'post-1',
        mr_iid: 123,
    };

    test('sends resolved notification only for an announced conflict', async () => {
        await service._handleConflictStateChange({
            ...mergeRequest,
            has_conflicts: 1,
            conflict_announced: 1,
        }, false);

        expect(updateMergeRequestConflicts).toHaveBeenCalledWith(10, false, false);
        expect(postMessageInTreed).toHaveBeenCalledWith(
            'post-1',
            expect.stringContaining('Back-End Merge Request были *разрешены*')
        );
    });

    test('does not send resolved notification for an unannounced recalculation conflict', async () => {
        await service._handleConflictStateChange({
            ...mergeRequest,
            has_conflicts: 1,
            conflict_announced: 0,
        }, false);

        expect(updateMergeRequestConflicts).toHaveBeenCalledWith(10, false, false);
        expect(postMessageInTreed).not.toHaveBeenCalled();
    });

    test('announces newly detected conflicts', async () => {
        await service._handleConflictStateChange({
            ...mergeRequest,
            has_conflicts: 0,
            conflict_announced: 0,
        }, true);

        expect(updateMergeRequestConflicts).toHaveBeenCalledWith(10, true, true);
        expect(postMessageInTreed).toHaveBeenCalledWith(
            'post-1',
            expect.stringContaining('Обнаружены конфликты для Back-End Merge Request')
        );
    });
});
