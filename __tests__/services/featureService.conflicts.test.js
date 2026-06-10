jest.mock('../../db/models/featureReady', () => ({
    addFeatureReady: jest.fn(),
    updateFeatureMergeRequestConflictState: jest.fn(),
}));

jest.mock('../../mattermost/utils', () => ({
    postMessage: jest.fn(),
    postMessageInTreed: jest.fn(),
    pinPost: jest.fn(),
}));

jest.mock('../../services/gitlabService', () => ({
    getProjectByName: jest.fn(),
    getMergeRequestById: jest.fn(),
}));

jest.mock('../../services/gitlabService/conflictResolver', () => ({
    tryResolveBackendConflicts: jest.fn(),
}));

jest.mock('../../config', () => ({
    FEATURE_IS_READY_CHANNEL_ID: 'feature-channel',
}));

jest.mock('../../logger', () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
}));

const FeatureService = require('../../services/featureService');
const {
    updateFeatureMergeRequestConflictState,
} = require('../../db/models/featureReady');

describe('FeatureService conflict announcement state', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('marks only announced conflicts for later resolved notification', async () => {
        await FeatureService._markAnnouncedConflicts(42, {
            details: [
                { tag: '@c1-back', hasConflicts: true },
                { tag: '@c1-front', hasConflicts: false },
                { tag: '@c1-aqa', hasConflicts: true },
            ],
        });

        expect(updateFeatureMergeRequestConflictState).toHaveBeenCalledTimes(2);
        expect(updateFeatureMergeRequestConflictState).toHaveBeenCalledWith(42, '@c1-back', true, true);
        expect(updateFeatureMergeRequestConflictState).toHaveBeenCalledWith(42, '@c1-aqa', true, true);
    });
});
