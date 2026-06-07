jest.mock('../../cron/cronExecutionTracker', () => ({
    getJobsNeedingRetry: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../cron/cronManager', () => ({
    getRunnerForKey: jest.fn(),
}));
jest.mock('../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const cronExecutionTracker = require('../../cron/cronExecutionTracker');
const cronManager = require('../../cron/cronManager');
const logger = require('../../logger');

// Подключаем сам сервис после моков (синглтон)
const cronWatchdogService = require('../../cron/cronWatchdogService');

describe('CronWatchdogService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        cronWatchdogService.stop();
    });

    afterEach(() => {
        cronWatchdogService.stop();
    });

    describe('start / stop', () => {
        test('start запускает интервал и логирует', () => {
            cronWatchdogService.start();
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringMatching(/Запущен.*проверка каждые/)
            );
            cronWatchdogService.stop();
        });

        test('stop сбрасывает интервал и логирует', () => {
            cronWatchdogService.start();
            jest.clearAllMocks();
            cronWatchdogService.stop();
            expect(logger.info).toHaveBeenCalledWith('[CronWatchdog] Остановлен');
        });

        test('повторный start не создаёт второй интервал', () => {
            cronWatchdogService.start();
            cronWatchdogService.start();
            cronWatchdogService.stop();
            expect(logger.info.mock.calls.filter((c) => c[0].includes('Запущен'))).toHaveLength(1);
        });
    });

    describe('_checkAndRetry', () => {
        test('если getJobsNeedingRetry вернул пустой массив — ничего не запускает', async () => {
            jest.useFakeTimers();
            cronExecutionTracker.getJobsNeedingRetry.mockResolvedValue([]);
            cronWatchdogService.start();
            jest.advanceTimersByTime(310000);
            await Promise.resolve();
            expect(logger.warn).not.toHaveBeenCalled();
            jest.useRealTimers();
        });

        test('если есть задачи для retry — берёт runner из manager и запускает', async () => {
            jest.useFakeTimers();
            const runner = jest.fn();
            const lastExpectedRun = new Date('2026-03-16T09:00:00.000Z');
            cronExecutionTracker.getJobsNeedingRetry.mockResolvedValue([
                { key: 'duty_1', lastExpectedRun },
            ]);
            cronManager.getRunnerForKey.mockReturnValue(runner);
            cronWatchdogService.start();
            jest.advanceTimersByTime(310000);
            await Promise.resolve();

            expect(cronExecutionTracker.getJobsNeedingRetry).toHaveBeenCalledWith(
                expect.objectContaining({ toleranceMs: expect.any(Number) })
            );
            expect(cronManager.getRunnerForKey).toHaveBeenCalledWith('duty_1');
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Принудительный запуск 1 задач')
            );
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Запуск задачи duty_1')
            );
            expect(runner).toHaveBeenCalled();
            jest.useRealTimers();
        });

        test('если runner не найден — логирует warn и не падает', async () => {
            jest.useFakeTimers();
            cronExecutionTracker.getJobsNeedingRetry.mockResolvedValue([
                { key: 'duty_1', lastExpectedRun: new Date() },
            ]);
            cronManager.getRunnerForKey.mockReturnValue(null);
            cronWatchdogService.start();
            jest.advanceTimersByTime(310000);
            await Promise.resolve();

            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Runner не найден для задачи duty_1')
            );
            jest.useRealTimers();
        });

        test('при выбросе ошибки из runner логирует и не падает', async () => {
            jest.useFakeTimers();
            const runner = jest.fn().mockImplementation(() => {
                throw new Error('Task failed');
            });
            cronExecutionTracker.getJobsNeedingRetry.mockResolvedValue([
                { key: 'duty_1', lastExpectedRun: new Date() },
            ]);
            cronManager.getRunnerForKey.mockReturnValue(runner);
            cronWatchdogService.start();
            jest.advanceTimersByTime(310000);
            await Promise.resolve();

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Ошибка при принудительном запуске duty_1')
            );
            jest.useRealTimers();
        });
    });
});
