// Централизованные моки для conflictResolver
jest.mock('../../../services/gitlabService/index');
jest.mock('../../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

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
    GitlabService.updateFile.mockResolvedValue(true);
});

module.exports = {
    GitlabService,
    logger,
};

