// Импортируем моки (они уже настроены в setup)
const {
    getPost,
    postMessage,
    postMessageInTreed,
    getChannelMembers,
    getEnabledReviewChannelIdsForUser,
    getReviewTaskByKey,
    getReviewTaskByPostId,
    addReviewTask,
    addTaskNotification,
    updateReviewTaskStatus,
    updateReviewTaskReviewer,
    updateReviewTaskMetadata,
    JiraService,
    GitlabService,
    isToDoStatus,
    isInProgressStatus,
    extractTaskNumber,
    parseGitlabMrUrl,
} = require('./review.setup');

const domainEventBus = require('../../../services/domainEventBus');
const reviewCommand = require('../../../commands/review'); // путь под проект

describe('review command', () => {
    const ctx = {
        post_id: 'post-1',
        user_id: 'user-1',
        user_name: 'john.doe',
        channel_id: 'test-channel-1',
    };

    afterEach(() => {
        domainEventBus.removeAllListeners('review.thread_ready');
    });

    test('если taskKey не указан и связанной записи нет — пишет ошибку в тред', async () => {
        getPost.mockResolvedValue({ root_id: 'root-1' });
        getReviewTaskByPostId.mockResolvedValue(null);

        await reviewCommand({
            post_id: 'post-1',
            user_id: 'user-1',
            user_name: 'john',
            channel_id: 'test-channel-1',
            args: [null],
        });

        expect(postMessageInTreed).toHaveBeenCalledWith(
            'post-1',
            expect.stringContaining('Не удалось найти задачу')
        );
        expect(postMessage).not.toHaveBeenCalled();
    });

    test('создание новой записи и переход To Do -> In Progress -> In Review', async () => {
        JiraService.fetchTask.mockResolvedValue({
            key: 'CASEM-1',
            summary: 'Sample',
            status: 'To Do',
            pullRequests: [],
            reviewers: [],
        });

        // два успешных перехода
        JiraService.changeTaskStatus
            .mockResolvedValueOnce(true)  // To Do -> In Progress
            .mockResolvedValueOnce(true); // In Progress -> In Review

        addReviewTask.mockResolvedValue('rt-1');

        await reviewCommand({
            post_id: 'post-1',
            user_id: 'user-1',
            user_name: 'john',
            channel_id: 'test-channel-1',
            args: ['CASEM-1', null, null],
        });

        expect(JiraService.fetchTask).toHaveBeenCalledWith('CASEM-1');
        expect(JiraService.changeTaskStatus).toHaveBeenNthCalledWith(1, 'CASEM-1', 'In Progress');
        expect(JiraService.changeTaskStatus).toHaveBeenNthCalledWith(2, 'CASEM-1', 'In Review');

        expect(postMessage).toHaveBeenCalledWith(
            'test-channel-1',
            expect.stringContaining('**IN REVIEW**')
        );

        expect(addReviewTask).toHaveBeenCalledWith(expect.objectContaining({
            channel_id: 'test-channel-1',
            post_id: 'new-post-123',
            user_id: 'user-1',
            task_key: 'CASEM-1',
            merge_request_url: null,
            reviewer: null,
        }));
        expect(addTaskNotification).toHaveBeenCalledWith('rt-1');
    });

    test('не отправляет в канал, исключенный персональными настройками', async () => {
        getEnabledReviewChannelIdsForUser.mockResolvedValueOnce([]);

        await reviewCommand({
            post_id: 'post-1',
            user_id: 'user-1',
            user_name: 'john',
            channel_id: 'test-channel-1',
            args: ['CASEM-1', null, null],
        });

        expect(postMessage).not.toHaveBeenCalled();
        expect(addReviewTask).not.toHaveBeenCalled();
    });

    test('не создает запись review task, если Mattermost не создал пост', async () => {
        postMessage.mockResolvedValueOnce(undefined);

        await reviewCommand({
            post_id: 'post-1',
            user_id: 'user-1',
            user_name: 'john',
            channel_id: 'test-channel-1',
            args: ['CASEM-1', null, null],
        });

        expect(postMessage).toHaveBeenCalledWith(
            'test-channel-1',
            expect.stringContaining('**IN REVIEW**')
        );
        expect(addReviewTask).not.toHaveBeenCalled();
    });

    test('если To Do -> In Progress не удалось — пишет ошибку и останавливается', async () => {
        JiraService.fetchTask.mockResolvedValue({
            key: 'CASEM-2',
            summary: 'Task',
            status: 'To Do',
            pullRequests: [],
            reviewers: [],
        });

        JiraService.changeTaskStatus.mockResolvedValueOnce(false);

        await reviewCommand({
            post_id: 'post-1',
            user_id: 'user-1',
            user_name: 'john',
            channel_id: 'test-channel-1',
            args: ['CASEM-2', null, null],
        });

        expect(postMessageInTreed).toHaveBeenCalledWith(
            'post-1',
            expect.stringContaining('Не удалось перевести задачу')
        );
        expect(JiraService.changeTaskStatus).toHaveBeenCalledTimes(1);
        expect(addReviewTask).not.toHaveBeenCalled();
    });

    test('повторное сообщение в тред при существующей записи + смена ревьювера', async () => {
        getPost.mockResolvedValue({ root_id: 'root-2' });
        getReviewTaskByPostId.mockResolvedValue({
            id: 777,
            post_id: 'old-post-777',
            task_key: 'CASEM-3',
            reviewer: '@qa',
        });

        JiraService.fetchTask.mockResolvedValue({
            key: 'CASEM-3',
            summary: 'Existing',
            status: 'In Progress',
            pullRequests: [],
            reviewers: [],
        });

        JiraService.changeTaskStatus.mockResolvedValueOnce(true);

        await reviewCommand({
            post_id: 'post-1',
            user_id: 'user-1',
            user_name: 'john',
            channel_id: 'test-channel-1',
            args: [null, null, '@dev'],
        });

        expect(postMessageInTreed).toHaveBeenCalledWith(
            'old-post-777',
            expect.stringContaining('Изменён ревьювер: @dev')
        );
        expect(updateReviewTaskStatus).toHaveBeenCalledWith({
            task_key: 'CASEM-3',
            status: 'In Review',
        });
        expect(updateReviewTaskReviewer).toHaveBeenCalledWith({
            task_key: 'CASEM-3',
            reviewer: '@dev',
        });
        expect(addTaskNotification).toHaveBeenCalledWith(777);
        expect(postMessage).not.toHaveBeenCalled();
    });

    test('если reviewTask не найден по root post id, берет задачу из первого сообщения треда', async () => {
        getPost
            .mockResolvedValueOnce({ id: 'reply-1', root_id: 'root-3' })
            .mockResolvedValueOnce({ id: 'root-3', message: '**IN REVIEW** CASEM-4 Existing' });
        getReviewTaskByPostId.mockResolvedValue(null);
        extractTaskNumber.mockReturnValue('CASEM-4');
        getReviewTaskByKey.mockResolvedValue({
            id: 778,
            post_id: 'root-3',
            task_key: 'CASEM-4',
            reviewer: '@qa',
        });

        JiraService.fetchTask.mockResolvedValue({
            key: 'CASEM-4',
            summary: 'Existing',
            status: 'In Progress',
            pullRequests: [],
            reviewers: [],
        });

        JiraService.changeTaskStatus.mockResolvedValueOnce(true);

        await reviewCommand({
            post_id: 'reply-1',
            user_id: 'user-1',
            user_name: 'john',
            channel_id: 'test-channel-1',
            args: [null, null, '@dev'],
        });

        expect(extractTaskNumber).toHaveBeenCalledWith({ id: 'root-3', message: '**IN REVIEW** CASEM-4 Existing' });
        expect(getReviewTaskByKey).toHaveBeenCalledWith('CASEM-4');
        expect(updateReviewTaskReviewer).toHaveBeenCalledWith({
            task_key: 'CASEM-4',
            reviewer: '@dev',
        });
        expect(postMessage).not.toHaveBeenCalled();
    });

    test('повторное ревью обновляет MR-метаданные и эмитит событие для существующей задачи', async () => {
        const listener = jest.fn();
        const mrUrl = 'https://gitlab.example/caseone/CasePro/-/merge_requests/15616';
        domainEventBus.on('review.thread_ready', listener);
        getPost.mockResolvedValue({ id: 'reply-1', root_id: 'root-15616' });
        getReviewTaskByPostId.mockResolvedValue({
            id: 779,
            channel_id: 'old-channel',
            post_id: 'root-15616',
            user_id: 'author-1',
            task_key: 'CASEM-15616',
            reviewer: '@qa',
            merge_request_url: null,
            gitlab_merge_request_id: null,
        });
        JiraService.fetchTask.mockResolvedValue({
            key: 'CASEM-15616',
            summary: 'Existing with MR',
            status: 'In Review',
            pullRequests: [],
            reviewers: [],
        });
        parseGitlabMrUrl.mockReturnValue({ project: 'caseone/CasePro', mrIid: '15616' });
        GitlabService.getProjectByName.mockResolvedValue({ project_id: 123 });
        GitlabService.addMergeRequest.mockResolvedValue(456);

        await reviewCommand({
            post_id: 'reply-1',
            user_id: 'user-1',
            user_name: 'john',
            channel_id: 'test-channel-1',
            args: [null, mrUrl, null],
        });

        expect(updateReviewTaskMetadata).toHaveBeenCalledWith({
            task_key: 'CASEM-15616',
            channel_id: 'old-channel',
            post_id: 'root-15616',
            user_id: 'author-1',
            merge_request_url: mrUrl,
            gitlab_merge_request_id: 456,
        });
        expect(addTaskNotification).toHaveBeenCalledWith(779);
        expect(listener).toHaveBeenCalledWith({
            reviewTaskId: 779,
            taskKey: 'CASEM-15616',
            postId: 'root-15616',
            channelId: 'old-channel',
            userId: 'author-1',
            mergeRequestUrl: mrUrl,
            gitlabMergeRequestId: 456,
        });
    });
});
