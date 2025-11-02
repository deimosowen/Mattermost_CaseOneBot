require('./dutyService.setup');

const {
    getDutyFromDB,
    getDutyUsers,
    getDutySchedule,
    setCurrentDuty,
    updateUserActivityStatus,
    getUserByUsernameOrEmail,
    absenceService,
    postMessage,
    DutyType,
    logger,
    resources,
    moment,
} = require('./dutyService.setup');

const dutyService = require('../../../services/dutyService');

describe('DutyService', () => {
    const channelId = 'test-channel-1';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('смена дежурного при уходе в отпуск (баг-фикс)', () => {
        test('использует полный список из БД для определения позиции (computeNextDutyChange)', async () => {
            // Тест проверяет, что computeNextDutyChange (используется в createDutyCallback)
            // использует полный список для определения позиции, даже если текущий в отпуске
            
            // Полный список дежурных в БД
            const allUsers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', is_disabled: false },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith', is_disabled: true }, // В отпуске, но в БД есть
                { id: 3, user_id: 'user-3', user_name: 'bob.wilson', is_disabled: false },
            ];

            // Текущий дежурный - user-2, но он в отпуске
            const currentDuty = { user_id: 'user-2', duty_type: DutyType.REGULAR };

            getDutyFromDB.mockResolvedValue(currentDuty);
            getDutyUsers.mockResolvedValue(allUsers);

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();

            getUserByUsernameOrEmail
                .mockResolvedValue({ id: 'user-1', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', email: 'jane@example.com' })
                .mockResolvedValueOnce({ id: 'user-3', email: 'bob@example.com' });

            // user-2 в отпуске
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValue({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: false }, // В отпуске
                'bob@example.com': { [currentDateISO]: true },
            });

            getDutySchedule.mockResolvedValue({
                nextDutyMessage: 'Следующий дежурный: {user}',
            });

            // Тестируем через createDutyCallback, который использует computeNextDutyChange
            const callback = dutyService.createDutyCallback(channelId, false);
            await callback();

            // Должен использовать getDutyUsers (полный список) для поиска позиции
            expect(getDutyUsers).toHaveBeenCalled();
            
            // И найти следующего доступного после user-2 в полном списке (user-3)
            expect(setCurrentDuty).toHaveBeenCalledWith(channelId, 'user-3', DutyType.REGULAR);
            expect(postMessage).toHaveBeenCalled();
        });

        test('правильно переходит к следующему пользователю, пропуская того, кто в отпуске', async () => {
            // Полный список: [user-1, user-2(в отпуске), user-3]
            // Текущий: user-1
            // Следующий должен быть user-3 (пропуская user-2)

            const allUsers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', is_disabled: false },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith', is_disabled: true }, // В отпуске
                { id: 3, user_id: 'user-3', user_name: 'bob.wilson', is_disabled: false },
            ];

            const currentDuty = { user_id: 'user-1', duty_type: DutyType.REGULAR };
            
            getDutyFromDB.mockResolvedValueOnce(currentDuty);
            getDutyUsers.mockResolvedValueOnce(allUsers);

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();

            getUserByUsernameOrEmail
                .mockResolvedValueOnce({ id: 'user-1', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', email: 'jane@example.com' })
                .mockResolvedValueOnce({ id: 'user-3', email: 'bob@example.com' });

            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: false }, // В отпуске
                'bob@example.com': { [currentDateISO]: true },
            });

            getDutySchedule.mockResolvedValueOnce({
                nextDutyMessage: 'Следующий дежурный: {user}',
            });

            const result = await dutyService.changeNextDuty(channelId);

            // Должен назначить user-3, пропустив user-2
            expect(setCurrentDuty).toHaveBeenCalledWith(channelId, 'user-3', DutyType.REGULAR);
            expect(result).toBeTruthy();
        });

        test('не сбрасывает счетчик, пропуская пользователя в отпуске при следующей смене', async () => {
            // Сценарий: user-1 дежурный, user-2 в отпуске, user-3 следующий
            // Смена должна перейти к user-3 (пропуская user-2), сохраняя порядок в полном списке

            const allUsers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', is_disabled: false },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith', is_disabled: true }, // В отпуске
                { id: 3, user_id: 'user-3', user_name: 'bob.wilson', is_disabled: false },
            ];

            // Текущий дежурный - user-1
            const currentDuty = { user_id: 'user-1', duty_type: DutyType.REGULAR };
            
            getDutyFromDB.mockResolvedValueOnce(currentDuty);
            getDutyUsers.mockResolvedValueOnce(allUsers);

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();

            getUserByUsernameOrEmail
                .mockResolvedValueOnce({ id: 'user-1', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', email: 'jane@example.com' })
                .mockResolvedValueOnce({ id: 'user-3', email: 'bob@example.com' });

            // user-2 в отпуске
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: false }, // В отпуске
                'bob@example.com': { [currentDateISO]: true },
            });

            getDutySchedule.mockResolvedValueOnce({
                nextDutyMessage: 'Следующий дежурный: {user}',
            });

            const result = await dutyService.changeNextDuty(channelId);

            // Должен перейти к user-3 (пропуская user-2 в отпуске)
            // Счетчик не сбрасывается, порядок сохраняется
            expect(setCurrentDuty).toHaveBeenCalledWith(channelId, 'user-3', DutyType.REGULAR);
            expect(result).toBeTruthy();
        });

        test('правильно обрабатывает циклический переход через пользователя в отпуске', async () => {
            // Сценарий: [user-1, user-2(отпуск), user-3]
            // Текущий: user-3 (последний)
            // Следующий должен быть user-1 (циклически, пропуская user-2)

            const allUsers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', is_disabled: false },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith', is_disabled: true }, // В отпуске
                { id: 3, user_id: 'user-3', user_name: 'bob.wilson', is_disabled: false },
            ];

            const currentDuty = { user_id: 'user-3', duty_type: DutyType.REGULAR };
            
            getDutyFromDB.mockResolvedValueOnce(currentDuty);
            getDutyUsers.mockResolvedValueOnce(allUsers);

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();

            getUserByUsernameOrEmail
                .mockResolvedValueOnce({ id: 'user-1', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', email: 'jane@example.com' })
                .mockResolvedValueOnce({ id: 'user-3', email: 'bob@example.com' });

            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: false }, // В отпуске
                'bob@example.com': { [currentDateISO]: true },
            });

            getDutySchedule.mockResolvedValueOnce({
                nextDutyMessage: 'Следующий дежурный: {user}',
            });

            const result = await dutyService.changeNextDuty(channelId);

            // Должен циклически перейти к user-1 (пропуская user-2)
            expect(setCurrentDuty).toHaveBeenCalledWith(channelId, 'user-1', DutyType.REGULAR);
        });

        test('computeNextDutyChange использует полный список для поиска позиции текущего дежурного', async () => {
            // Ключевой тест для бага: computeNextDutyChange использует allUsers для определения позиции
            // даже если текущий дежурный в актуальном списке отсутствует (в отпуске)

            const allUsers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', is_disabled: false },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith', is_disabled: true }, // В отпуске
                { id: 3, user_id: 'user-3', user_name: 'bob.wilson', is_disabled: false },
            ];

            // Текущий дежурный - user-2, но он в отпуске
            const currentDuty = { user_id: 'user-2', duty_type: DutyType.REGULAR };
            
            getDutyFromDB.mockResolvedValue(currentDuty);
            getDutyUsers.mockResolvedValue(allUsers);

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();

            getUserByUsernameOrEmail
                .mockResolvedValue({ id: 'user-1', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', email: 'jane@example.com' })
                .mockResolvedValueOnce({ id: 'user-3', email: 'bob@example.com' });

            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValue({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: false }, // В отпуске
                'bob@example.com': { [currentDateISO]: true },
            });

            getDutySchedule.mockResolvedValue({
                nextDutyMessage: 'Следующий дежурный: {user}',
            });

            // Тестируем через createDutyCallback, который использует computeNextDutyChange
            const callback = dutyService.createDutyCallback(channelId, false);
            await callback();

            // Важно: должен использовать getDutyUsers (полный список) для поиска позиции
            expect(getDutyUsers).toHaveBeenCalled();
            
            // И найти следующего доступного после user-2 в полном списке (user-3)
            expect(setCurrentDuty).toHaveBeenCalledWith(channelId, 'user-3', DutyType.REGULAR);
        });
    });

    describe('getActualDutyList', () => {
        test('фильтрует пользователей в отпуске', async () => {
            const allUsers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', is_disabled: false },
                { id: 2, user_id: 'user-2', user_name: 'jane.smith', is_disabled: false },
            ];

            getDutyUsers.mockResolvedValueOnce(allUsers);

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();

            getUserByUsernameOrEmail
                .mockResolvedValueOnce({ id: 'user-1', email: 'john@example.com' })
                .mockResolvedValueOnce({ id: 'user-2', email: 'jane@example.com' });

            // user-2 в отпуске
            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
                'jane@example.com': { [currentDateISO]: false }, // В отпуске
            });

            // getActualDutyList не экспортирована, проверяем через changeNextDuty
            await dutyService.changeNextDuty(channelId);

            // Должен обновить статус user-2
            expect(updateUserActivityStatus).toHaveBeenCalledWith(
                expect.any(Number),
                true,
                currentDate
            );
        });

        test('реактивирует пользователей, у которых прошел return_date', async () => {
            const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');
            
            const allUsers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', is_disabled: true, return_date: yesterday },
            ];

            getDutyUsers.mockResolvedValueOnce(allUsers);

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();

            getUserByUsernameOrEmail.mockResolvedValueOnce({ id: 'user-1', email: 'john@example.com' });

            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
            });

            await dutyService.changeNextDuty(channelId);

            // Должен реактивировать пользователя
            expect(updateUserActivityStatus).toHaveBeenCalledWith(
                1,
                false,
                null
            );
        });
    });

    describe('changeNextDuty', () => {
        test('возвращает ошибку если нет пользователей', async () => {
            getDutyUsers.mockResolvedValueOnce([]);

            const result = await dutyService.changeNextDuty(channelId);

            expect(result).toBe(resources.duty.noUsersError);
        });

        test('возвращает ошибку если нет текущего дежурного', async () => {
            const allUsers = [
                { id: 1, user_id: 'user-1', user_name: 'john.doe', is_disabled: false },
            ];

            getDutyFromDB.mockResolvedValueOnce(null);
            getDutyUsers.mockResolvedValueOnce(allUsers);

            const currentDate = moment().format('YYYY-MM-DD');
            const currentDateISO = moment(currentDate).toISOString();

            getUserByUsernameOrEmail.mockResolvedValueOnce({ id: 'user-1', email: 'john@example.com' });

            absenceService.checkEmployeeAvailabilityByDate.mockResolvedValueOnce({
                'john@example.com': { [currentDateISO]: true },
            });

            const result = await dutyService.changeNextDuty(channelId);

            expect(result).toBe(resources.duty.noExistingError);
        });
    });
});

