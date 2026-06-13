jest.mock('../../db/models/featureReady', () => ({
    getFeaturesWithOpenMRs: jest.fn(),
    getFeatureReadyById: jest.fn(),
    updateMergeRequestConflictMonitoring: jest.fn(),
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
const { updateMergeRequestConflictMonitoring } = require('../../db/models/featureReady');
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
            conflict_pending_has_conflicts: 0,
            conflict_pending_count: 1,
        }, { hasConflicts: false, sourceSha: 'source-2' });

        expect(updateMergeRequestConflictMonitoring).toHaveBeenCalledWith(10, {
            hasConflicts: false,
            conflictAnnounced: false,
            pendingHasConflicts: null,
            pendingCount: 0,
            conflictSourceSha: null,
        });
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
            conflict_pending_has_conflicts: 0,
            conflict_pending_count: 1,
        }, { hasConflicts: false, sourceSha: 'source-2' });

        expect(updateMergeRequestConflictMonitoring).toHaveBeenCalledWith(10, {
            hasConflicts: false,
            conflictAnnounced: false,
            pendingHasConflicts: null,
            pendingCount: 0,
            conflictSourceSha: null,
        });
        expect(postMessageInTreed).not.toHaveBeenCalled();
    });

    test('announces newly detected conflicts', async () => {
        await service._handleConflictStateChange({
            ...mergeRequest,
            has_conflicts: 0,
            conflict_announced: 0,
            conflict_pending_has_conflicts: 1,
            conflict_pending_count: 1,
        }, { hasConflicts: true, sourceSha: 'source-1' });

        expect(updateMergeRequestConflictMonitoring).toHaveBeenCalledWith(10, {
            hasConflicts: true,
            conflictAnnounced: true,
            pendingHasConflicts: null,
            pendingCount: 0,
            conflictSourceSha: 'source-1',
        });
        expect(postMessageInTreed).toHaveBeenCalledWith(
            'post-1',
            expect.stringContaining('Обнаружены конфликты для Back-End Merge Request')
        );
    });

    test('does not announce conflicts on first changed observation', async () => {
        await service._handleConflictStateChange({
            ...mergeRequest,
            has_conflicts: 0,
            conflict_announced: 0,
            conflict_pending_has_conflicts: null,
            conflict_pending_count: 0,
        }, { hasConflicts: true, sourceSha: 'source-1' });

        expect(updateMergeRequestConflictMonitoring).toHaveBeenCalledWith(10, {
            pendingHasConflicts: true,
            pendingCount: 1,
        });
        expect(postMessageInTreed).not.toHaveBeenCalled();
    });

    test('clears pending conflict state when observation returns to stored state', async () => {
        await service._handleConflictStateChange({
            ...mergeRequest,
            has_conflicts: 0,
            conflict_announced: 0,
            conflict_pending_has_conflicts: 1,
            conflict_pending_count: 1,
        }, { hasConflicts: false, sourceSha: 'source-1' });

        expect(updateMergeRequestConflictMonitoring).toHaveBeenCalledWith(10, {
            pendingHasConflicts: null,
            pendingCount: 0,
        });
        expect(postMessageInTreed).not.toHaveBeenCalled();
    });

    test('backfills source sha for existing active conflicts without notifying', async () => {
        await service._handleConflictStateChange({
            ...mergeRequest,
            has_conflicts: 1,
            conflict_announced: 1,
            conflict_pending_has_conflicts: null,
            conflict_pending_count: 0,
            conflict_source_sha: null,
        }, { hasConflicts: true, sourceSha: 'source-1' });

        expect(updateMergeRequestConflictMonitoring).toHaveBeenCalledWith(10, {
            conflictSourceSha: 'source-1',
        });
        expect(postMessageInTreed).not.toHaveBeenCalled();
    });

    test('suppresses resolved notification when only target branch recalculated conflicts', async () => {
        await service._handleConflictStateChange({
            ...mergeRequest,
            has_conflicts: 1,
            conflict_announced: 1,
            conflict_pending_has_conflicts: null,
            conflict_pending_count: 0,
            conflict_source_sha: 'source-1',
        }, { hasConflicts: false, sourceSha: 'source-1' });

        expect(updateMergeRequestConflictMonitoring).toHaveBeenCalledWith(10, {
            pendingHasConflicts: false,
            pendingCount: 1,
        });
        expect(postMessageInTreed).not.toHaveBeenCalled();
    });
});
