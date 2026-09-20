jest.mock('../../services/jiraService', () => ({
    changeTaskStatus: jest.fn(),
}));
jest.mock('../../services/gitlabService', () => ({}));
jest.mock('../../services/reviewDistributionService', () => ({}));
jest.mock('../../mattermost/utils', () => ({
    getUserByEmail: jest.fn(),
    getUserByUsername: jest.fn(),
}));
jest.mock('../../services/gitlabService/gitlabHelper', () => ({
    parseGitlabMrUrl: jest.fn(),
}));
jest.mock('../../services/jiraService/jiraHelper', () => ({
    isToDoStatus: jest.fn(),
    isInProgressStatus: jest.fn(),
}));
jest.mock('../../db/models/reviewTask', () => ({
    getReviewTaskByKey: jest.fn(),
    addReviewTask: jest.fn(),
    updateReviewTaskStatus: jest.fn(),
    updateReviewTaskReviewer: jest.fn(),
    updateReviewTaskMetadata: jest.fn(),
    addTaskNotification: jest.fn(),
}));
jest.mock('../../logger', () => ({
    warn: jest.fn(),
    error: jest.fn(),
}));

const domainEventBus = require('../../services/domainEventBus');
const reviewTaskModel = require('../../db/models/reviewTask');
const reviewTaskService = require('../../services/reviewTaskService');

describe('reviewTaskService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        domainEventBus.removeAllListeners('review.thread_ready');
    });

    afterEach(() => {
        domainEventBus.removeAllListeners('review.thread_ready');
    });

    test('emits review.thread_ready when review task is created', async () => {
        const listener = jest.fn();
        domainEventBus.on('review.thread_ready', listener);
        reviewTaskModel.getReviewTaskByKey.mockResolvedValue(null);
        reviewTaskModel.addReviewTask.mockResolvedValue(42);

        const id = await reviewTaskService.createOrUpdateReviewTask({
            taskKey: 'CASEM-1',
            channelId: 'channel-1',
            postId: 'post-1',
            userId: 'user-1',
            mergeRequestUrl: 'https://gitlab.example/group/project/-/merge_requests/1',
            reviewer: '@reviewer',
            gitlabMergeRequestId: 7,
        });

        expect(id).toBe(42);
        expect(reviewTaskModel.updateReviewTaskMetadata).not.toHaveBeenCalled();
        expect(listener).toHaveBeenCalledWith({
            reviewTaskId: 42,
            taskKey: 'CASEM-1',
            postId: 'post-1',
            channelId: 'channel-1',
            userId: 'user-1',
            mergeRequestUrl: 'https://gitlab.example/group/project/-/merge_requests/1',
            gitlabMergeRequestId: 7,
        });
    });

    test('updates existing review task metadata before emitting review.thread_ready', async () => {
        const listener = jest.fn();
        domainEventBus.on('review.thread_ready', listener);
        reviewTaskModel.getReviewTaskByKey.mockResolvedValue({
            id: 43,
            task_key: 'CASEM-2',
            channel_id: 'old-channel',
            post_id: 'old-post',
            user_id: 'old-user',
            merge_request_url: null,
            gitlab_merge_request_id: null,
        });

        const id = await reviewTaskService.createOrUpdateReviewTask({
            taskKey: 'CASEM-2',
            channelId: 'new-channel',
            postId: 'new-post',
            userId: 'new-user',
            mergeRequestUrl: 'https://gitlab.example/group/project/-/merge_requests/2',
            reviewer: null,
            gitlabMergeRequestId: 8,
        });

        expect(id).toBe(43);
        expect(reviewTaskModel.updateReviewTaskMetadata).toHaveBeenCalledWith({
            task_key: 'CASEM-2',
            channel_id: 'new-channel',
            post_id: 'new-post',
            user_id: 'new-user',
            merge_request_url: 'https://gitlab.example/group/project/-/merge_requests/2',
            gitlab_merge_request_id: 8,
        });
        expect(listener).toHaveBeenCalledWith({
            reviewTaskId: 43,
            taskKey: 'CASEM-2',
            postId: 'new-post',
            channelId: 'new-channel',
            userId: 'new-user',
            mergeRequestUrl: 'https://gitlab.example/group/project/-/merge_requests/2',
            gitlabMergeRequestId: 8,
        });
    });
});
