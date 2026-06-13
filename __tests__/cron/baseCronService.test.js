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

const mockCronJob = jest.fn().mockImplementation(function (schedule, callback) {
    this.schedule = schedule;
    this.callback = callback;
    this.start = jest.fn();
    this.stop = jest.fn();
});
jest.mock('cron', () => ({
    CronJob: mockCronJob,
}));

const BaseCronService = require('../../cron/baseCronService');
const cronExecutionTracker = require('../../cron/cronExecutionTracker');
const logger = require('../../logger');

describe('BaseCronService createCriticalJob', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new BaseCronService('TestCron', 'UTC');
    });

    afterEach(() => {
        service.stopAll();
    });

    test('регистрирует задачу в трекере и создаёт CronJob с обёрнутым callback', () => {
        const callback = jest.fn();
        const job = service.createCriticalJob('duty_1', '0 9 * * *', callback);

        expect(cronExecutionTracker.registerCriticalJob).toHaveBeenCalledWith(
            'duty_1',
            '0 9 * * *',
            { tz: 'UTC' }
        );
        expect(mockCronJob).toHaveBeenCalledWith('0 9 * * *', expect.any(Function), null, false, 'UTC');
        expect(job).toBeDefined();
        expect(job.start).toHaveBeenCalled();
        expect(service.getCriticalRunner('duty_1')).toBe(mockCronJob.mock.calls[0][1]);
    });

    test('createJob не запускает повторный callback, пока предыдущий запуск активен', async () => {
        let finishFirstRun;
        const callback = jest
            .fn()
            .mockImplementationOnce(() => new Promise((resolve) => {
                finishFirstRun = resolve;
            }))
            .mockResolvedValueOnce(undefined);

        service.createJob('calendar_notifications', '* * * * *', callback);
        const wrappedCallback = mockCronJob.mock.calls[0][1];

        const firstRun = wrappedCallback();
        await Promise.resolve();
        const skippedRun = wrappedCallback();

        expect(callback).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('previous run is still active')
        );

        finishFirstRun();
        await firstRun;
        await skippedRun;

        await wrappedCallback();
        expect(callback).toHaveBeenCalledTimes(2);
    });

    test('при вызове обёрнутого callback вызываются recordStart, callback, recordSuccess при успехе', async () => {
        const callback = jest.fn().mockResolvedValue(undefined);
        service.createCriticalJob('duty_1', '0 9 * * *', callback);
        const wrappedCallback = mockCronJob.mock.calls[0][1];
        cronExecutionTracker.recordSuccess.mockResolvedValue(undefined);

        wrappedCallback();
        await Promise.resolve();
        await Promise.resolve();

        expect(cronExecutionTracker.recordStart).toHaveBeenCalledWith('duty_1');
        expect(callback).toHaveBeenCalled();
        expect(cronExecutionTracker.recordSuccess).toHaveBeenCalledWith('duty_1');
    });

    test('при ошибке в callback вызываются recordFailure и logger.error', async () => {
        const err = new Error('Duty failed');
        const callback = jest.fn().mockRejectedValue(err);
        service.createCriticalJob('duty_1', '0 9 * * *', callback);
        const wrappedCallback = mockCronJob.mock.calls[0][1];

        wrappedCallback();
        await Promise.resolve();
        await Promise.resolve();

        expect(cronExecutionTracker.recordFailure).toHaveBeenCalledWith('duty_1');
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Критичная задача duty_1 завершилась с ошибкой')
        );
    });

    test('stopJob вызывает unregisterCriticalJob и удаляет runner', () => {
        service.createCriticalJob('duty_1', '0 9 * * *', jest.fn());
        expect(service.getCriticalRunner('duty_1')).toBeDefined();
        service.stopJob('duty_1');
        expect(cronExecutionTracker.unregisterCriticalJob).toHaveBeenCalledWith('duty_1');
        expect(service.getCriticalRunner('duty_1')).toBeUndefined();
    });
});
