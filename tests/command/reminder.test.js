const reminderCommand = require('../../commands/reminder');
const { postMessage } = require('../../mattermost/utils');
const cronValidator = require('cron-validator');
const { addReminder } = require('../../db/models/reminders');
const { setCronJob } = require('../../cron');
const TaskType = require('../../types/taskTypes');

// Мокаем функции и модули
jest.mock('../../mattermost/utils', () => ({
    postMessage: jest.fn(),
}));

jest.mock('cron-validator', () => ({
    isValidCron: jest.fn(),
}));

jest.mock('../../db/models/reminders', () => ({
    addReminder: jest.fn(),
}));

jest.mock('../../cron', () => ({
    setCronJob: jest.fn(),
}));

describe('reminder command', () => {

    it('should notify if cron schedule is missing', async () => {
        const mockData = {
            channel_id: 'testChannel',
            args: []
        };

        await reminderCommand(mockData);

        expect(postMessage).toHaveBeenCalledWith('testChannel', 'Ошибка: параметр [cron-расписание] отсутствует.');
    });

    it('should notify if cron schedule is invalid', async () => {
        const mockData = {
            channel_id: 'testChannel',
            args: ['invalidCron', 'message']
        };

        await reminderCommand(mockData);

        expect(postMessage).toHaveBeenCalledWith('testChannel', 'Ошибка: параметр [cron-расписание] "invalidCron" является недопустимым.');
    });

    it('should notify if message is missing', async () => {
        cronValidator.isValidCron.mockReturnValueOnce(true);
        const mockData = {
            channel_id: 'testChannel',
            args: ['* * * * *']
        };

        await reminderCommand(mockData);

        expect(postMessage).toHaveBeenCalledWith('testChannel', 'Ошибка: сообщение отсутствует.');
    });

    it('should set a new reminder', async () => {
        cronValidator.isValidCron.mockReturnValueOnce(true);
        addReminder.mockReturnValueOnce('123');
        setCronJob.mockReturnValueOnce({
            nextDate: () => ({ toFormat: jest.fn(() => '2023-11-01 12:00') })
        });

        const mockData = {
            channel_id: 'testChannel',
            channel_name: 'Test Channel Name',
            user_id: 'testUserID',
            user_name: 'TestUserName',
            args: ['* * * * *', 'Test message']
        };

        await reminderCommand(mockData);

        expect(addReminder).toHaveBeenCalledWith('testChannel', expect.anything(), expect.anything(), expect.anything(), '* * * * *', 'Test message');
        expect(setCronJob).toHaveBeenCalledWith('123', '* * * * *', expect.any(Function), TaskType.REMINDER);
        expect(postMessage).toHaveBeenCalledWith('testChannel', 'Успешно добавлено. Следующее напоминание будет в 2023-11-01 12:00 (UTC)');
    });
});
