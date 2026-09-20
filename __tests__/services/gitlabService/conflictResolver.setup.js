// Централизованные моки для conflictResolver
jest.mock('../../../services/gitlabService/index');
jest.mock('../../../config', () => ({
    AUTO_RESOLVE_CONFLICTS: true,
}));
jest.mock('../../../logger', () => {
    const mock = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
    mock.child = jest.fn(() => ({ ...mock }));
    return mock;
});

// Импорт после jest.mock(...)
const GitlabService = require('../../../services/gitlabService/index');
const logger = require('../../../logger');

beforeEach(() => {
    jest.clearAllMocks();

    // Дефолтные моки
    GitlabService.getProjectByName.mockResolvedValue({
        project_id: 1,
        project_name: 'test-project'
    });
    GitlabService.getMergeRequestInfo.mockResolvedValue({
        source_branch: 'feature-branch',
        target_branch: 'develop',
        has_conflicts: true
    });
    GitlabService.getFileContent.mockResolvedValue(null);
    GitlabService.updateFiles.mockResolvedValue(true);
});

module.exports = {
    GitlabService,
    logger,
};

