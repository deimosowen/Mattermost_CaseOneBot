jest.mock('../../mattermost/utils', () => ({
    getPost: jest.fn(),
    postMessageInTreed: jest.fn(),
}));

jest.mock('../../db/models/reviewTask', () => ({
    getReviewTaskByPostId: jest.fn(),
    updateReviewTaskStatus: jest.fn(),
}));

jest.mock('../../services/jiraService', () => ({
    fetchTask: jest.fn(),
    changeTaskStatus: jest.fn(),
    addComment: jest.fn(),
}));

jest.mock('../../services/jiraService/jiraHelper', () => ({
    isInReviewStatus: jest.fn(),
    extractTaskNumber: jest.fn(),
}));

jest.mock('../../logger', () => ({
    error: jest.fn(),
}));

const { getPost, postMessageInTreed } = require('../../mattermost/utils');
const { getReviewTaskByPostId, updateReviewTaskStatus } = require('../../db/models/reviewTask');
const JiraService = require('../../services/jiraService');
const { isInReviewStatus, extractTaskNumber } = require('../../services/jiraService/jiraHelper');
const reopCommand = require('../../commands/reop');

describe('reop command', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        getReviewTaskByPostId.mockResolvedValue(null);
        extractTaskNumber.mockReturnValue('CASEM-5');
        JiraService.fetchTask.mockResolvedValue({ status: 'In Review' });
        JiraService.changeTaskStatus.mockResolvedValue(true);
        JiraService.addComment.mockResolvedValue(true);
        isInReviewStatus.mockReturnValue(true);
        updateReviewTaskStatus.mockResolvedValue(1);
    });

    test('берет задачу из первого сообщения треда при вызове из reply', async () => {
        getPost
            .mockResolvedValueOnce({ id: 'reply-1', root_id: 'root-1' })
            .mockResolvedValueOnce({ id: 'root-1', message: '**IN REVIEW** CASEM-5 Task' });

        await reopCommand({
            post_id: 'reply-1',
            user_name: '@john',
            args: ['need fixes'],
        });

        expect(getReviewTaskByPostId).toHaveBeenCalledWith('root-1');
        expect(extractTaskNumber).toHaveBeenCalledWith({ id: 'root-1', message: '**IN REVIEW** CASEM-5 Task' });
        expect(JiraService.changeTaskStatus).toHaveBeenCalledWith('CASEM-5', 'To Do');
        expect(JiraService.addComment).toHaveBeenCalledWith('CASEM-5', '[~john]: need fixes');
        expect(updateReviewTaskStatus).toHaveBeenCalledWith({
            task_key: 'CASEM-5',
            status: 'To Do',
        });
        expect(postMessageInTreed).toHaveBeenCalledWith(
            'reply-1',
            expect.stringContaining('Задача переведена')
        );
    });

    test('берет задачу из текущего сообщения, если вызов пришел в root post', async () => {
        getPost.mockResolvedValueOnce({ id: 'root-1', root_id: '', message: '**IN REVIEW** CASEM-5 Task' });

        await reopCommand({
            post_id: 'root-1',
            user_name: '@john',
            args: [],
        });

        expect(getPost).toHaveBeenCalledTimes(1);
        expect(getReviewTaskByPostId).toHaveBeenCalledWith('root-1');
        expect(extractTaskNumber).toHaveBeenCalledWith({ id: 'root-1', root_id: '', message: '**IN REVIEW** CASEM-5 Task' });
        expect(JiraService.changeTaskStatus).toHaveBeenCalledWith('CASEM-5', 'To Do');
    });
});
