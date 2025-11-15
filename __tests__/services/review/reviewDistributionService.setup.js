// Централизованные моки для reviewDistributionService
jest.mock('../../../mattermost/utils');
jest.mock('../../../db/models/reviewSettings');
jest.mock('../../../db/models/reviewQueue');
jest.mock('../../../db/models/reviewTask');
jest.mock('../../../services/absenceService');
jest.mock('../../../services/cacheService');
jest.mock('../../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

// Импорт после jest.mock(...)
const { getUser, getChannelMembers } = require('../../../mattermost/utils');
const {
    getChannelReviewSettings,
    setChannelReviewSettings,
} = require('../../../db/models/reviewSettings');
const {
    getActiveReviewQueue,
    getReviewQueue,
    setCurrentReviewer,
    getCurrentReviewer,
    updateReviewerActivityStatus,
} = require('../../../db/models/reviewQueue');
const { updateReviewTaskReviewer } = require('../../../db/models/reviewTask');
const absenceService = require('../../../services/absenceService');
const cacheService = require('../../../services/cacheService');
const logger = require('../../../logger');

beforeEach(() => {
    jest.clearAllMocks();

    // Дефолтные моки
    getUser.mockResolvedValue({ id: 'user-1', username: 'john.doe', email: 'john@example.com' });
    getChannelMembers.mockResolvedValue([]);
    getChannelReviewSettings.mockResolvedValue(null);
    setChannelReviewSettings.mockResolvedValue(undefined);
    getActiveReviewQueue.mockResolvedValue([]);
    getReviewQueue.mockResolvedValue([]);
    getCurrentReviewer.mockResolvedValue(null);
    setCurrentReviewer.mockResolvedValue(undefined);
    updateReviewerActivityStatus.mockResolvedValue(undefined);
    updateReviewTaskReviewer.mockResolvedValue(undefined);
    absenceService.checkEmployeeAvailabilityByDate.mockResolvedValue({});
    cacheService.get.mockReturnValue(null);
    cacheService.set.mockReturnValue(undefined);
    cacheService.delete.mockReturnValue(undefined);
});

module.exports = {
    // utils
    getUser,
    getChannelMembers,

    // db models
    getChannelReviewSettings,
    setChannelReviewSettings,
    getActiveReviewQueue,
    getReviewQueue,
    setCurrentReviewer,
    getCurrentReviewer,
    updateReviewerActivityStatus,
    updateReviewTaskReviewer,

    // services
    absenceService,
    cacheService,

    // logger
    logger,
};

