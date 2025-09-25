require('./reviewManager.setup'); // применяем моки до загрузки SUT

const { moment } = require('./reviewManager.setup');
const {
    getReviewTasksByStatus,
    getNotClosedReviewTasks,
    getTaskNotifications,
    addTaskNotification,
    updateReviewTaskStatus,
    postMessageInTreed,
    getUserByEmail,
    JiraService,
    JiraStatusType,
    reviewCommand,
} = require('./reviewManager.setup');

// Экспортируется СИНГЛТОН: new ReviewManager()
const reviewManager = require('../../../services/reviewService');

describe('ReviewManager.checkTasksStatus', () => {
    test('до 05:00 UTC — уведомления не шлём', async () => {
        // 04:30Z — до окна
        jest.setSystemTime(new Date('2025-09-06T04:30:00Z'));

        // чтобы не упереться в выходной, замокаем метод isHoliday()
        jest.spyOn(reviewManager, 'isHoliday').mockResolvedValue(false);

        await reviewManager.checkTasksStatus();

        expect(getReviewTasksByStatus).not.toHaveBeenCalled();
        expect(postMessageInTreed).not.toHaveBeenCalled();
        expect(addTaskNotification).not.toHaveBeenCalled();
    });

    test('праздничный/выходной день — выходим без действий', async () => {
        jest.setSystemTime(new Date('2025-09-06T06:30:00Z')); // после 05:00
        jest.spyOn(reviewManager, 'isHoliday').mockResolvedValue(true);

        await reviewManager.checkTasksStatus();

        expect(getReviewTasksByStatus).not.toHaveBeenCalled();
        expect(postMessageInTreed).not.toHaveBeenCalled();
        expect(addTaskNotification).not.toHaveBeenCalled();
    });

    test('после 05:00, уведомления за сегодня ещё не было, updated_at — вчера → шлём уведомление и фиксируем', async () => {
        jest.setSystemTime(new Date('2025-09-06T10:00:00Z'));
        jest.spyOn(reviewManager, 'isHoliday').mockResolvedValue(false);

        const task = {
            id: 101,
            post_id: 'thread-101',
            task_key: 'CASEM-101',
            updated_at: '2025-09-05T18:10:00Z', // вчера (до начала текущего дня)
            reviewer: null,
            status: JiraStatusType.INREVIEW,
        };

        getReviewTasksByStatus.mockResolvedValue([task]);

        // последнее уведомление было вчера
        getTaskNotifications.mockResolvedValue([
            { created_at: '2025-09-05T06:00:00Z' },
        ]);

        JiraService.fetchTask.mockResolvedValue({ status: JiraStatusType.INREVIEW });

        await reviewManager.checkTasksStatus();

        expect(postMessageInTreed).toHaveBeenCalledWith(
            'thread-101',
            expect.stringContaining('переведена в **In Review**')
        );
        expect(addTaskNotification).toHaveBeenCalledWith(101);
        expect(updateReviewTaskStatus).not.toHaveBeenCalled();
    });

    test('после 05:00, если в Jira статус уже не INREVIEW — обновляем статус и не шлём уведомление', async () => {
        jest.setSystemTime(new Date('2025-09-06T10:00:00Z'));
        jest.spyOn(reviewManager, 'isHoliday').mockResolvedValue(false);

        const task = {
            id: 102,
            post_id: 'thread-102',
            task_key: 'CASEM-102',
            updated_at: '2025-09-05T12:00:00Z', // вчера
            reviewer: null,
            status: JiraStatusType.INREVIEW,
        };

        getReviewTasksByStatus.mockResolvedValue([task]);
        getTaskNotifications.mockResolvedValue([]); // не было уведомлений сегодня
        JiraService.fetchTask.mockResolvedValue({ status: JiraStatusType.INPROGRESS });

        await reviewManager.checkTasksStatus();

        expect(updateReviewTaskStatus).toHaveBeenCalledWith({
            task_key: 'CASEM-102',
            status: JiraStatusType.INPROGRESS,
        });
        expect(postMessageInTreed).not.toHaveBeenCalled();
        expect(addTaskNotification).not.toHaveBeenCalled();
    });

    test('если за сегодня уже было уведомление — пропускаем', async () => {
        jest.setSystemTime(new Date('2025-09-06T11:00:00Z'));
        jest.spyOn(reviewManager, 'isHoliday').mockResolvedValue(false);

        const task = {
            id: 103,
            post_id: 'thread-103',
            task_key: 'CASEM-103',
            updated_at: '2025-09-05T20:00:00Z',
            reviewer: null,
            status: JiraStatusType.INREVIEW,
        };

        getReviewTasksByStatus.mockResolvedValue([task]);

        // последнее уведомление — сегодня
        getTaskNotifications.mockResolvedValue([
            { created_at: '2025-09-06T08:00:00Z' },
        ]);

        await reviewManager.checkTasksStatus();

        expect(postMessageInTreed).not.toHaveBeenCalled();
        expect(addTaskNotification).not.toHaveBeenCalled();
    });
});

describe('ReviewManager.actualizeReviewTasks', () => {
    test('обновляет статус, если он отличается от статуса в Jira', async () => {
        const items = [
            { task_key: 'CASEM-201', status: 'In Progress' },
            { task_key: 'CASEM-202', status: 'In Review' },
        ];
        getNotClosedReviewTasks.mockResolvedValue(items);

        // CASEM-201 в Jira теперь In Review — нужно обновить
        // CASEM-202 в Jira остался In Review — обновлять не нужно
        JiraService.fetchTask
            .mockResolvedValueOnce({ status: 'In Review' })
            .mockResolvedValueOnce({ status: 'In Review' });

        await reviewManager.actualizeReviewTasks();

        expect(updateReviewTaskStatus).toHaveBeenCalledTimes(1);
        expect(updateReviewTaskStatus).toHaveBeenCalledWith({
            task_key: 'CASEM-201',
            status: 'In Review',
        });
    });
});

describe('ReviewManager.sendNotification', () => {
    test('постит в тред и добавляет отметку уведомления', async () => {
        const t = {
            id: 301,
            post_id: 'thread-301',
            task_key: 'CASEM-301',
            updated_at: '2025-09-05T12:00:00Z',
            reviewer: '@qa',
        };

        await reviewManager.sendNotification(t);

        expect(postMessageInTreed).toHaveBeenCalledWith(
            'thread-301',
            expect.stringContaining('[CASEM-301]')
        );
        expect(addTaskNotification).toHaveBeenCalledWith(301);
    });

    test('если postMessageInTreed вернул falsy — отметку не добавляем', async () => {
        postMessageInTreed.mockResolvedValueOnce(null);

        const t = {
            id: 302,
            post_id: 'thread-302',
            task_key: 'CASEM-302',
            updated_at: '2025-09-05T12:00:00Z',
            reviewer: null,
        };

        await reviewManager.sendNotification(t);

        expect(addTaskNotification).not.toHaveBeenCalled();
    });
});

describe('ReviewManager.handleReviewCommand', () => {
    test('вызывает reviewCommand с корректными параметрами', async () => {
        getUserByEmail.mockResolvedValueOnce({ id: 'u-9', username: 'alice' });

        await reviewManager.handleReviewCommand({ taskKey: 'CASEM-999', userName: 'alice' });

        expect(reviewCommand).toHaveBeenCalledWith({
            post_id: null,
            user_id: 'u-9',
            user_name: '@alice',
            args: ['CASEM-999', null, null],
        });
    });

    test('если пользователь не найден — команду не вызываем', async () => {
        getUserByEmail.mockResolvedValueOnce(null);

        await reviewManager.handleReviewCommand({ taskKey: 'CASEM-1000', userName: 'ghost' });

        expect(reviewCommand).not.toHaveBeenCalled();
    });
});
