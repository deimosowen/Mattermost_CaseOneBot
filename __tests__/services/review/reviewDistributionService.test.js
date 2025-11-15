require('./reviewDistributionService.setup');

const {
    getUser,
    getChannelReviewSettings,
    setChannelReviewSettings,
    getActiveReviewQueue,
    getReviewQueue,
    setCurrentReviewer,
    getCurrentReviewer,
    updateReviewerActivityStatus,
    updateReviewTaskReviewer,
    absenceService,
    cacheService,
    logger,
} = require('./reviewDistributionService.setup');

const reviewDistributionService = require('../../../services/reviewDistributionService');
const moment = require('moment');

describe('ReviewDistributionService', () => {
    const channelId = 'test-channel-1';
    const taskKey = 'CASEM-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getNextReviewer', () => {
        test('возвращает null если настройки не найдены', async () => {
            getChannelReviewSettings.mockResolvedValueOnce(null);

            const result = await reviewDistributionService.getNextReviewer(channelId);

            expect(result).toBeNull();
            expect(getChannelReviewSettings).toHaveBeenCalledWith(channelId);
        });

        test('возвращает null если автоматическое распределение отключено', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: false,
                review_type: 'queue',
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            expect(result).toBeNull();
        });

        test('возвращает null если тип ревью - manual', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'manual',
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            expect(result).toBeNull();
        });

        test('возвращает первого ревьюера из очереди если текущего нет', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            const reviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe' },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith' },
            ];

            getCurrentReviewer.mockResolvedValueOnce(null);
            getActiveReviewQueue.mockResolvedValueOnce(reviewers);
            getUser.mockResolvedValue({ id: 'user-1', username: 'john.doe', email: 'john@example.com' });
            getUser.mockResolvedValueOnce({ id: 'user-1', username: 'john.doe', email: 'john@example.com' });
            getUser.mockResolvedValueOnce({ id: 'user-2', username: 'jane.smith', email: 'jane@example.com' });

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: true },
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            expect(result).toEqual(reviewers[0]);
            expect(setCurrentReviewer).toHaveBeenCalledWith(channelId, 'user-1');
        });

        test('возвращает следующего ревьюера в очереди', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            const reviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe' },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith' },
                { id: 3, user_id: 'user-3', user_name: 'bob.wilson' },
            ];

            getCurrentReviewer.mockResolvedValueOnce({ user_id: 'user-1' });
            getActiveReviewQueue.mockResolvedValueOnce(reviewers);
            getUser
                .mockResolvedValueOnce({ id: 'user-1', username: 'john.doe', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', username: 'jane.smith', email: 'jane@example.com' })
                .mockResolvedValueOnce({ id: 'user-3', username: 'bob.wilson', email: 'bob@example.com' });

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: true },
                'bob@example.com': { [currentDateISO]: true },
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            expect(result).toEqual(reviewers[1]); // Следующий после user-1
            expect(setCurrentReviewer).toHaveBeenCalledWith(channelId, 'user-2');
        });

        test('циклически переходит к первому ревьюеру после последнего', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            const reviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe' },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith' },
            ];

            getCurrentReviewer.mockResolvedValueOnce({ user_id: 'user-2' }); // Последний в очереди
            getActiveReviewQueue.mockResolvedValueOnce(reviewers);
            getUser
                .mockResolvedValueOnce({ id: 'user-1', username: 'john.doe', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', username: 'jane.smith', email: 'jane@example.com' });

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: true },
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            expect(result).toEqual(reviewers[0]); // Вернулся к первому
            expect(setCurrentReviewer).toHaveBeenCalledWith(channelId, 'user-1');
        });

        test('пропускает ревьюеров в отпуске', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            const reviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe' },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith' }, // В отпуске
                { id: 3, user_id: 'user-3', user_name: 'bob.wilson' },
            ];

            getCurrentReviewer.mockResolvedValueOnce({ user_id: 'user-1' });
            getActiveReviewQueue.mockResolvedValueOnce(reviewers);
            getUser
                .mockResolvedValueOnce({ id: 'user-1', username: 'john.doe', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', username: 'jane.smith', email: 'jane@example.com' })
                .mockResolvedValueOnce({ id: 'user-3', username: 'bob.wilson', email: 'bob@example.com' });

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: false }, // В отпуске
                'bob@example.com': { [currentDateISO]: true },
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            // Пропустил jane.smith и вернул bob.wilson
            expect(result).toEqual(reviewers[2]);
            expect(updateReviewerActivityStatus).toHaveBeenCalledWith(2, true, currentDate);
        });

        test('правильно находит следующего ревьюера когда текущий ушел в отпуск', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            // Текущий ревьюер - user-2 (order_number = 1), но он ушел в отпуск
            const currentReviewer = { user_id: 'user-2' };
            
            // Активные ревьюеры (без user-2, который в отпуске)
            const activeReviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', order_number: 0 },
                { id: 3, user_id: 'user-3', user_name: 'bob.wilson', order_number: 2 },
            ];

            // Полная очередь (включая user-2 в отпуске)
            const allReviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', order_number: 0 },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith', order_number: 1 }, // В отпуске
                { id: 3, user_id: 'user-3', user_name: 'bob.wilson', order_number: 2 },
            ];

            getCurrentReviewer.mockResolvedValueOnce(currentReviewer);
            getActiveReviewQueue.mockResolvedValueOnce(activeReviewers);
            getReviewQueue.mockResolvedValueOnce(allReviewers);
            getUser
                .mockResolvedValueOnce({ id: 'user-1', username: 'john.doe', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-3', username: 'bob.wilson', email: 'bob@example.com' });

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
                'bob@example.com': { [currentDateISO]: true },
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            // Должен вернуть user-3 (следующий по order_number после user-2), а не user-1 (первого в списке)
            expect(result).toEqual(activeReviewers[1]); // bob.wilson
            expect(result.user_id).toBe('user-3');
            expect(setCurrentReviewer).toHaveBeenCalledWith(channelId, 'user-3');
            expect(getReviewQueue).toHaveBeenCalledWith(channelId);
        });

        test('циклически переходит к первому когда текущий в отпуске был последним', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            // Текущий ревьюер - user-3 (order_number = 2, последний), но он ушел в отпуск
            const currentReviewer = { user_id: 'user-3' };
            
            // Активные ревьюеры (без user-3, который в отпуске)
            const activeReviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', order_number: 0 },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith', order_number: 1 },
            ];

            // Полная очередь (включая user-3 в отпуске)
            const allReviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', order_number: 0 },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith', order_number: 1 },
                { id: 3, user_id: 'user-3', user_name: 'bob.wilson', order_number: 2 }, // В отпуске
            ];

            getCurrentReviewer.mockResolvedValueOnce(currentReviewer);
            getActiveReviewQueue.mockResolvedValueOnce(activeReviewers);
            getReviewQueue.mockResolvedValueOnce(allReviewers);
            getUser
                .mockResolvedValueOnce({ id: 'user-1', username: 'john.doe', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', username: 'jane.smith', email: 'jane@example.com' });

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: true },
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            // Должен вернуть первого (циклическая ротация), так как user-3 был последним
            expect(result).toEqual(activeReviewers[0]); // john.doe
            expect(result.user_id).toBe('user-1');
            expect(setCurrentReviewer).toHaveBeenCalledWith(channelId, 'user-1');
        });

        test('возвращает null если нет активных ревьюеров', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            getActiveReviewQueue.mockResolvedValueOnce([]);

            const result = await reviewDistributionService.getNextReviewer(channelId);

            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Нет активных ревьюеров')
            );
        });
    });

    describe('assignReviewerForTask', () => {
        test('назначает ревьюера и обновляет задачу', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            const reviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe' },
            ];

            getCurrentReviewer.mockResolvedValueOnce(null);
            getActiveReviewQueue.mockResolvedValueOnce(reviewers);
            getUser.mockResolvedValueOnce({ id: 'user-1', username: 'john.doe', email: 'john@example.com' });

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
            });

            const result = await reviewDistributionService.assignReviewerForTask(channelId, taskKey);

            expect(result).toEqual(reviewers[0]);
            expect(updateReviewTaskReviewer).toHaveBeenCalledWith({
                reviewer: 'john.doe',
                task_key: taskKey,
            });
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Назначен ревьюер john.doe')
            );
        });

        test('возвращает null если нет доступных ревьюеров', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            getActiveReviewQueue.mockResolvedValueOnce([]);

            const result = await reviewDistributionService.assignReviewerForTask(channelId, taskKey);

            expect(result).toBeNull();
            expect(updateReviewTaskReviewer).not.toHaveBeenCalled();
        });
    });

    describe('кэширование доступности', () => {
        test('использует кэш если данные есть в кэше', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            const reviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe' },
            ];

            getCurrentReviewer.mockResolvedValueOnce(null);
            getActiveReviewQueue.mockResolvedValueOnce(reviewers);
            getUser.mockResolvedValueOnce({ id: 'user-1', username: 'john.doe', email: 'john@example.com' });

            const currentDate = moment().format('YYYY-MM-DD');
            const cacheKey = `review_availability:john@example.com:${currentDate}`;
            
            // Мокаем кэш - данные уже есть
            cacheService.get.mockReturnValueOnce({
                value: true,
                expires: Date.now() + 24 * 60 * 60 * 1000, // Валидный кэш
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            // Должен использовать кэш, не делать запрос к API
            expect(cacheService.get).toHaveBeenCalledWith(cacheKey);
            expect(absenceService.checkEmployeeAvailabilityByDate).not.toHaveBeenCalled();
            expect(result).toEqual(reviewers[0]);
        });

        test('делает запрос к API если данных нет в кэше', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            const reviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe' },
            ];

            getCurrentReviewer.mockResolvedValueOnce(null);
            getActiveReviewQueue.mockResolvedValueOnce(reviewers);
            getUser.mockResolvedValueOnce({ id: 'user-1', username: 'john.doe', email: 'john@example.com' });

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();
            
            // Кэш пуст
            cacheService.get.mockReturnValueOnce(null);
            
            // API возвращает данные
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            // Должен сделать запрос к API
            expect(absenceService.checkEmployeeAvailabilityByDate).toHaveBeenCalledWith({
                employeeEmails: ['john@example.com'],
                dates: [currentDate],
            });

            // Должен сохранить в кэш
            expect(cacheService.set).toHaveBeenCalled();
            expect(result).toEqual(reviewers[0]);
        });

        test('использует частичный кэш - запрашивает только отсутствующие', async () => {
            getChannelReviewSettings.mockResolvedValueOnce({
                is_enabled: true,
                review_type: 'queue',
            });

            const reviewers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe' },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith' },
            ];

            getCurrentReviewer.mockResolvedValueOnce(null);
            getActiveReviewQueue.mockResolvedValueOnce(reviewers);
            getUser
                .mockResolvedValueOnce({ id: 'user-1', username: 'john.doe', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', username: 'jane.smith', email: 'jane@example.com' });

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();
            
            // john@example.com - есть в кэше
            cacheService.get
                .mockReturnValueOnce({
                    value: true,
                    expires: Date.now() + 24 * 60 * 60 * 1000,
                })
                // jane@example.com - нет в кэше
                .mockReturnValueOnce(null);

            // API вернет только для jane
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'jane@example.com': { [currentDateISO]: true },
            });

            const result = await reviewDistributionService.getNextReviewer(channelId);

            // Должен запросить только для jane, john из кэша
            expect(absenceService.checkEmployeeAvailabilityByDate).toHaveBeenCalledWith({
                employeeEmails: ['jane@example.com'],
                dates: [currentDate],
            });
            expect(result).toEqual(reviewers[0]);
        });
    });

    describe('enableAutoDistribution', () => {
        test('включает автоматическое распределение', async () => {
            setChannelReviewSettings.mockResolvedValueOnce(1);

            const result = await reviewDistributionService.enableAutoDistribution(channelId, 'queue');

            expect(result).toBe(true);
            expect(setChannelReviewSettings).toHaveBeenCalledWith(channelId, 'queue', true);
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Включено автоматическое распределение')
            );
        });
    });

    describe('disableAutoDistribution', () => {
        test('отключает автоматическое распределение', async () => {
            setChannelReviewSettings.mockResolvedValueOnce(1);

            const result = await reviewDistributionService.disableAutoDistribution(channelId);

            expect(result).toBe(true);
            expect(setChannelReviewSettings).toHaveBeenCalledWith(channelId, 'manual', false);
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Отключено автоматическое распределение')
            );
        });
    });

    describe('getChannelSettings', () => {
        test('возвращает настройки канала', async () => {
            const settings = {
                channel_id: channelId,
                review_type: 'queue',
                is_enabled: true,
            };

            getChannelReviewSettings.mockResolvedValueOnce(settings);

            const result = await reviewDistributionService.getChannelSettings(channelId);

            expect(result).toEqual(settings);
            expect(getChannelReviewSettings).toHaveBeenCalledWith(channelId);
        });

        test('обрабатывает ошибки при получении настроек', async () => {
            getChannelReviewSettings.mockRejectedValueOnce(new Error('DB error'));

            const result = await reviewDistributionService.getChannelSettings(channelId);

            expect(result).toBeNull();
            expect(logger.error).toHaveBeenCalled();
        });
    });
});

