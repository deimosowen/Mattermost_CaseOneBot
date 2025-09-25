// Мокаем все внешние зависимости, с которыми работает сервис
jest.mock('../../../db/models/reviewTask', () => ({
    getReviewTasksByStatus: jest.fn(),
    getNotClosedReviewTasks: jest.fn(),
    getTaskNotifications: jest.fn(),
    addTaskNotification: jest.fn(),
    updateReviewTaskStatus: jest.fn(),
}));

jest.mock('../../../mattermost/utils', () => ({
    postMessageInTreed: jest.fn(),
    getUserByEmail: jest.fn(),
}));

// reviewCommand как зависимость (для handleReviewCommand)
jest.mock('../../../commands/review', () => jest.fn());

// JiraService
jest.mock('../../../services/jiraService', () => ({
    fetchTask: jest.fn(),
    changeTaskStatus: jest.fn(),
    setReviewers: jest.fn(),
    handleReviewCommand: jest.fn(),
}));

// Константы статусов
jest.mock('../../../types/jiraStatusTypes', () => ({
    INREVIEW: 'In Review',
    INPROGRESS: 'In Progress',
}));

// Логгер
jest.mock('../../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const moment = require('moment');

const {
    getReviewTasksByStatus,
    getNotClosedReviewTasks,
    getTaskNotifications,
    addTaskNotification,
    updateReviewTaskStatus,
} = require('../../../db/models/reviewTask');

const { postMessageInTreed, getUserByEmail } = require('../../../mattermost/utils');
const reviewCommand = require('../../../commands/review');
const JiraService = require('../../../services/jiraService');
const JiraStatusType = require('../../../types/jiraStatusTypes');
const logger = require('../../../logger');

beforeAll(() => {
    // Используем фейковые таймеры, чтобы контролировать "текущее время" для moment.utc()
    jest.useFakeTimers();
});

afterAll(() => {
    jest.useRealTimers();
});

beforeEach(() => {
    jest.clearAllMocks();

    // Дефолтное "сейчас": 2025-09-06 06:00:00Z (после 05:00 UTC)
    jest.setSystemTime(new Date('2025-09-06T06:00:00Z'));

    // Дефолтные заглушки
    JiraService.fetchTask.mockResolvedValue({ status: JiraStatusType.INREVIEW });
    JiraService.changeTaskStatus.mockResolvedValue(true);

    postMessageInTreed.mockResolvedValue({ id: 'post-in-thread' });

    getReviewTasksByStatus.mockResolvedValue([]);
    getNotClosedReviewTasks.mockResolvedValue([]);
    getTaskNotifications.mockResolvedValue([]);

    getUserByEmail.mockResolvedValue({ id: 'u-1', username: 'john' });
    reviewCommand.mockResolvedValue(undefined);
});

module.exports = {
    moment,

    // db
    getReviewTasksByStatus,
    getNotClosedReviewTasks,
    getTaskNotifications,
    addTaskNotification,
    updateReviewTaskStatus,

    // mm
    postMessageInTreed,
    getUserByEmail,

    // jira
    JiraService,
    JiraStatusType,

    // other
    reviewCommand,
    logger,
};
