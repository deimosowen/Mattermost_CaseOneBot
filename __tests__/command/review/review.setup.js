// Централизованные моки для команды review
jest.mock('../../../mattermost/utils');
jest.mock('../../../db/models/reviewTask');
jest.mock('../../../services/jiraService');
jest.mock('../../../services/jiraService/jiraHelper', () => ({
    isToDoStatus: jest.fn(),
    isInProgressStatus: jest.fn(),
}));
jest.mock('../../../config', () => ({
    INREVIEW_CHANNEL_IDS: ['test-channel-1'], // фиксированное значение для тестов
}));
jest.mock('../../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

// Импорт после jest.mock(...)
const {
    getPost,
    postMessage,
    postMessageInTreed,
    getChannelMembers,
    getUserByUsername,
    getUserByEmail,
} = require('../../../mattermost/utils');

const {
    getReviewTaskByKey,
    getReviewTaskByPostId,
    addReviewTask,
    updateReviewTaskStatus,
    updateReviewTaskReviewer,
    addTaskNotification,
} = require('../../../db/models/reviewTask');

const JiraService = require('../../../services/jiraService');
const { isToDoStatus, isInProgressStatus } = require('../../../services/jiraService/jiraHelper');
const logger = require('../../../logger');

beforeEach(() => {
    jest.clearAllMocks();

    // Разумные дефолты для всех тестов
    getPost.mockResolvedValue({ root_id: 'root-1' });
    postMessage.mockResolvedValue({ id: 'new-post-123' });
    getChannelMembers.mockResolvedValue([{ user_id: 'user-1' }]);
    getReviewTaskByKey.mockResolvedValue(null);
    getReviewTaskByPostId.mockResolvedValue(null);

    // Хелперы статусов: по умолчанию соответствуют строковым статусам
    isToDoStatus.mockImplementation(s => s === 'To Do');
    isInProgressStatus.mockImplementation(s => s === 'In Progress');

    // Заглушки Jira
    JiraService.fetchTask.mockResolvedValue({
        key: 'CASEM-1',
        summary: 'Sample task',
        status: 'To Do',
        pullRequests: [],
        reviewers: [],
    });
    JiraService.changeTaskStatus.mockResolvedValue(true);
});

module.exports = {
    // utils
    getPost,
    postMessage,
    postMessageInTreed,
    getChannelMembers,
    getUserByUsername,
    getUserByEmail,

    // db
    getReviewTaskByKey,
    getReviewTaskByPostId,
    addReviewTask,
    updateReviewTaskStatus,
    updateReviewTaskReviewer,
    addTaskNotification,

    // jira
    JiraService,
    isToDoStatus,
    isInProgressStatus,

    // logger
    logger,
};
