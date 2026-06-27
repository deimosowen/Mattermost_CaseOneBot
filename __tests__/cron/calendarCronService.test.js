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

jest.mock('../../services/yandexService/calendar', () => ({
    notificationCronSchedule: '* * * * *',
    cleanupCronSchedule: '0 22 * * 0',
    notifyAllUsers: jest.fn(),
    cleanupNotifiedEvents: jest.fn(),
}));

const CalendarCronService = require('../../cron/calendarCronService');
const CalendarManager = require('../../services/yandexService/calendar');

describe('CalendarCronService', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new CalendarCronService();
    });

    afterEach(() => {
        service.stopAll();
    });

    test('регистрирует notification и cleanup задачи через BaseCronService', async () => {
        await service.loadJobsFromDb();

        expect(mockCronJob).toHaveBeenNthCalledWith(1, '* * * * *', expect.any(Function), null, false, 'UTC');
        expect(mockCronJob).toHaveBeenNthCalledWith(2, '0 22 * * 0', expect.any(Function), null, false, 'UTC');
        expect(service.jobs.calendar_notifications).toBeDefined();
        expect(service.jobs.calendar_cleanup).toBeDefined();
    });

    test('notification callback вызывает существующую календарную логику', async () => {
        CalendarManager.notifyAllUsers.mockResolvedValue(undefined);
        await service.loadJobsFromDb();

        const notificationCallback = mockCronJob.mock.calls[0][1];
        await notificationCallback();

        expect(CalendarManager.notifyAllUsers).toHaveBeenCalledTimes(1);
    });

    test('cleanup callback вызывает существующую очистку календаря', async () => {
        CalendarManager.cleanupNotifiedEvents.mockResolvedValue(undefined);
        await service.loadJobsFromDb();

        const cleanupCallback = mockCronJob.mock.calls[1][1];
        await cleanupCallback();

        expect(CalendarManager.cleanupNotifiedEvents).toHaveBeenCalledTimes(1);
    });
});
