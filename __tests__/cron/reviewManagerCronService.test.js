jest.mock('../../cron/cronExecutionTracker', () => ({
    unregisterCriticalJob: jest.fn(),
}));

jest.mock('../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const mockCronJob = jest.fn().mockImplementation(function (schedule, callback) {
    this.schedule = schedule;
    this.callback = callback;
    this.start = jest.fn();
    this.stop = jest.fn();
});

jest.mock('cron', () => ({
    CronJob: mockCronJob,
}));

jest.mock('../../services/reviewService', () => ({
    checkTaskStatusCronSchedule: '0 * * * *',
    checkTasksStatus: jest.fn(),
}));

const ReviewManagerCronService = require('../../cron/reviewManagerCronService');
const ReviewManager = require('../../services/reviewService');

describe('ReviewManagerCronService', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ReviewManagerCronService();
    });

    afterEach(() => {
        service.stopAll();
    });

    test('регистрирует проверку статусов через BaseCronService', async () => {
        await service.loadJobsFromDb();

        expect(mockCronJob).toHaveBeenCalledWith('0 * * * *', expect.any(Function), null, false, 'UTC');
        expect(service.jobs.review_manager_check_task_status).toBeDefined();
    });

    test('callback вызывает существующую логику ReviewManager', async () => {
        ReviewManager.checkTasksStatus.mockResolvedValue(undefined);
        await service.loadJobsFromDb();

        const callback = mockCronJob.mock.calls[0][1];
        await callback();

        expect(ReviewManager.checkTasksStatus).toHaveBeenCalledTimes(1);
    });
});
