jest.mock('../../cron/cronExecutionTracker', () => ({
    recordStart: jest.fn(),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    registerCriticalJob: jest.fn(),
    unregisterCriticalJob: jest.fn(),
}));
jest.mock('../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));
jest.mock('../../services/scheduledMessageDispatcher', () => ({
    processDueMessages: jest.fn().mockResolvedValue(0),
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

describe('ScheduledMessageCronService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    function loadServiceWithSchedule(schedule) {
        jest.doMock('../../config', () => ({
            MESSAGE_DELIVERY_CRON_SCHEDULE: schedule,
        }));

        const ScheduledMessageCronService = require('../../cron/scheduledMessageCronService');
        const logger = require('../../logger');
        return {
            logger,
            service: new ScheduledMessageCronService(),
        };
    }

    test('использует дефолтное расписание при невалидном MESSAGE_DELIVERY_CRON_SCHEDULE', async () => {
        const { logger, service } = loadServiceWithSchedule('*');

        await service.loadJobsFromDb();

        expect(logger.warn).toHaveBeenCalledWith(
            '[ScheduledMessageCron] Invalid MESSAGE_DELIVERY_CRON_SCHEDULE="*", using default "* * * * *"'
        );
        expect(mockCronJob).toHaveBeenCalledWith('* * * * *', expect.any(Function), null, false, 'UTC');
    });

    test('нормализует пробелы и принимает валидное расписание с секундным полем', async () => {
        const { logger, service } = loadServiceWithSchedule('  */30   *   *   *   *   *  ');

        await service.loadJobsFromDb();

        expect(logger.warn).not.toHaveBeenCalled();
        expect(mockCronJob).toHaveBeenCalledWith('*/30 * * * * *', expect.any(Function), null, false, 'UTC');
    });
});
