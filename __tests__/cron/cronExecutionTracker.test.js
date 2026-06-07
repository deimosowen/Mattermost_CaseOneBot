require('./cronExecutionTracker.setup');

const cronExecutionTracker = require('../../cron/cronExecutionTracker');
const { cronJobState, logger } = require('./cronExecutionTracker.setup');

describe('CronExecutionTracker', () => {
    const JOB_KEY = 'duty_1';
    const SCHEDULE = '0 9 * * *'; // каждый день в 9:00

    afterEach(() => {
        cronExecutionTracker.unregisterCriticalJob(JOB_KEY);
        cronExecutionTracker.unregisterCriticalJob('duty_2');
    });

    describe('registerCriticalJob / unregisterCriticalJob', () => {
        test('регистрирует метаданные задачи (без callback) и логирует', () => {
            cronExecutionTracker.registerCriticalJob(JOB_KEY, SCHEDULE, { tz: 'UTC' });

            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Зарегистрирована критичная задача: duty_1')
            );
            cronExecutionTracker.unregisterCriticalJob(JOB_KEY);
        });

        test('unregisterCriticalJob удаляет задачу из списка', async () => {
            cronExecutionTracker.registerCriticalJob(JOB_KEY, SCHEDULE);
            cronJobState.getLastSuccessByKeys.mockResolvedValue([]);

            cronExecutionTracker.unregisterCriticalJob(JOB_KEY);
            const toRetry = await cronExecutionTracker.getJobsNeedingRetry({ toleranceMs: 0 });
            expect(toRetry).toHaveLength(0);
        });
    });

    describe('recordSuccess', () => {
        test('вызывает upsertLastSuccess с ключом задачи', async () => {
            cronExecutionTracker.registerCriticalJob(JOB_KEY, SCHEDULE);

            await cronExecutionTracker.recordSuccess(JOB_KEY);

            expect(cronJobState.upsertLastSuccess).toHaveBeenCalledWith(JOB_KEY);
            cronExecutionTracker.unregisterCriticalJob(JOB_KEY);
        });

        test('при ошибке БД логирует и не бросает', async () => {
            cronExecutionTracker.registerCriticalJob(JOB_KEY, SCHEDULE);
            cronJobState.upsertLastSuccess.mockRejectedValueOnce(new Error('DB error'));

            await expect(cronExecutionTracker.recordSuccess(JOB_KEY)).resolves.not.toThrow();
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Ошибка записи успеха')
            );
            cronExecutionTracker.unregisterCriticalJob(JOB_KEY);
        });
    });

    describe('getJobsNeedingRetry', () => {
        test('без зарегистрированных задач возвращает пустой массив', async () => {
            const result = await cronExecutionTracker.getJobsNeedingRetry({ toleranceMs: 0 });
            expect(result).toEqual([]);
        });

        test('если в БД нет успеха после последнего ожидаемого запуска — задача попадает в retry (без callback)', async () => {
            cronExecutionTracker.registerCriticalJob(JOB_KEY, SCHEDULE);
            cronJobState.getLastSuccessByKeys.mockResolvedValue([]);

            const toRetry = await cronExecutionTracker.getJobsNeedingRetry({ toleranceMs: 0 });

            expect(toRetry).toHaveLength(1);
            expect(toRetry[0].key).toBe(JOB_KEY);
            expect(toRetry[0].lastExpectedRun).toBeInstanceOf(Date);
            expect(toRetry[0]).not.toHaveProperty('callback');
            cronExecutionTracker.unregisterCriticalJob(JOB_KEY);
        });

        test('если в БД есть успех после lastExpectedRun — задача не попадает в retry', async () => {
            cronExecutionTracker.registerCriticalJob(JOB_KEY, SCHEDULE);
            const now = new Date();
            const lastSuccessIso = now.toISOString();
            cronJobState.getLastSuccessByKeys.mockResolvedValue([{ job_key: JOB_KEY, last_success_at: lastSuccessIso }]);

            const toRetry = await cronExecutionTracker.getJobsNeedingRetry({ toleranceMs: 0 });

            expect(toRetry).toHaveLength(0);
            cronExecutionTracker.unregisterCriticalJob(JOB_KEY);
        });

        test('при ошибке чтения БД возвращает пустой массив и логирует', async () => {
            cronExecutionTracker.registerCriticalJob(JOB_KEY, SCHEDULE);
            cronJobState.getLastSuccessByKeys.mockRejectedValue(new Error('DB read error'));

            const toRetry = await cronExecutionTracker.getJobsNeedingRetry({ toleranceMs: 0 });

            expect(toRetry).toEqual([]);
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Ошибка чтения состояния из БД')
            );
            cronExecutionTracker.unregisterCriticalJob(JOB_KEY);
        });

        test('при невалидном расписании логирует ошибку и не падает', async () => {
            cronExecutionTracker.registerCriticalJob('duty_2', 'invalid cron');
            cronJobState.getLastSuccessByKeys.mockResolvedValue([]);

            const toRetry = await cronExecutionTracker.getJobsNeedingRetry({ toleranceMs: 0 });

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Ошибка разбора расписания')
            );
            cronExecutionTracker.unregisterCriticalJob('duty_2');
        });
    });
});
