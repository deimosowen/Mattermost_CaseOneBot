const reminderCommand = require('../../commands/reminder');
const { postMessageInTreed } = require('../../mattermost/utils');
const cronValidator = require('cron-validator');
const { addReminder } = require('../../db/models/reminders');
const cronManager = require('../../cron/cronManager');

jest.mock('../../mattermost/utils', () => ({
    postMessage: jest.fn(),
    postMessageInTreed: jest.fn(),
}));

jest.mock('cron-validator', () => ({
    isValidCron: jest.fn(),
}));

jest.mock('../../db/models/reminders', () => ({
    addReminder: jest.fn(),
}));

jest.mock('../../cron/CronManager', () => ({
    get: jest.fn(),
}));

describe('reminder command', () => {
    let reminderServiceMock;

    beforeEach(() => {
        jest.clearAllMocks();

        reminderServiceMock = {
            addJob: jest.fn().mockReturnValue({
                nextDate: () => ({ toFormat: jest.fn(() => '2023-11-01 12:00') }),
            }),
        };

        cronManager.get.mockReturnValue(reminderServiceMock);
    });

    it('should notify if cron schedule is missing', async () => {
        const mockData = { post_id: 'testPostId', args: [] };

        await reminderCommand(mockData);

        expect(postMessageInTreed).toHaveBeenCalledWith(
            'testPostId',
            'Ошибка: параметр [cron-расписание] отсутствует.'
        );
    });

    it('should notify if cron schedule is invalid', async () => {
        const mockData = { post_id: 'testPostId', args: ['invalidCron', 'message'] };

        cronValidator.isValidCron.mockReturnValueOnce(false);

        await reminderCommand(mockData);

        expect(postMessageInTreed).toHaveBeenCalledWith(
            'testPostId',
            'Ошибка: параметр [cron-расписание] "invalidCron" является недопустимым.'
        );
    });

    it('should notify if message is missing', async () => {
        cronValidator.isValidCron.mockReturnValueOnce(true);
        const mockData = { post_id: 'testPostId', args: ['* * * * *'] };

        await reminderCommand(mockData);

        expect(postMessageInTreed).toHaveBeenCalledWith(
            'testPostId',
            'Ошибка: сообщение отсутствует.'
        );
    });

    it('should set a new reminder', async () => {
        cronValidator.isValidCron.mockReturnValueOnce(true);
        addReminder.mockReturnValueOnce('123');

        const mockData = {
            post_id: 'testPostId',
            channel_id: 'testChannel',
            channel_name: 'Test Channel Name',
            user_id: 'testUserID',
            user_name: 'TestUserName',
            args: ['* * * * *', 'Test message'],
        };

        await reminderCommand(mockData);

        // проверяем запись в БД
        expect(addReminder).toHaveBeenCalledWith(
            'testChannel',
            'Test Channel Name',
            'testUserID',
            'TestUserName',
            '* * * * *',
            'Test message'
        );

        // проверяем вызов addJob
        expect(reminderServiceMock.addJob).toHaveBeenCalledWith(
            expect.objectContaining({
                id: '123',
                channel_id: 'testChannel',
                schedule: '* * * * *',
                message: 'Test message',
            })
        );

        // проверяем, что сообщение об успехе отправлено
        expect(postMessageInTreed).toHaveBeenCalledWith(
            'testPostId',
            'Успешно добавлено. Следующее напоминание будет в 2023-11-01 12:00 (UTC)'
        );
    });
});
