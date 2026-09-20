jest.mock('../../mattermost/utils', () => ({
    getPost: jest.fn(),
    postMessageInTreed: jest.fn(),
}));
jest.mock('../../services/flakyTest', () => ({
    runManualCheckForMergeRequest: jest.fn(),
}));
jest.mock('../../logger', () => ({
    error: jest.fn(),
}));

const { getPost, postMessageInTreed } = require('../../mattermost/utils');
const flakyTest = require('../../services/flakyTest');
const flakyCheckCommand = require('../../commands/flakyCheck');
const { parseCommand } = require('../../commands/parser');

describe('flaky-check command', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getPost.mockResolvedValue({
            id: 'post-1',
            root_id: 'root-1',
            channel_id: 'channel-1',
            user_id: 'user-1',
        });
        flakyTest.runManualCheckForMergeRequest.mockResolvedValue({ checkedBuilds: 1, failedTests: 2 });
    });

    test('parses MR URL as a single argument', () => {
        expect(parseCommand('!flaky-check https://gitlab.example/group/project/-/merge_requests/12')).toEqual([
            '!flaky-check',
            'https://gitlab.example/group/project/-/merge_requests/12',
        ]);
    });

    test('prints usage when MR URL is missing', async () => {
        await flakyCheckCommand({
            post_id: 'post-1',
            args: [],
        });

        expect(postMessageInTreed).toHaveBeenCalledWith(
            'post-1',
            expect.stringContaining('Передай ссылку')
        );
        expect(flakyTest.runManualCheckForMergeRequest).not.toHaveBeenCalled();
    });

    test('runs manual flaky check and replies in current thread', async () => {
        await flakyCheckCommand({
            post_id: 'post-1',
            args: ['https://gitlab.example/group/project/-/merge_requests/12'],
        });

        expect(postMessageInTreed).not.toHaveBeenCalled();
        expect(flakyTest.runManualCheckForMergeRequest).toHaveBeenCalledWith({
            mergeRequestUrl: 'https://gitlab.example/group/project/-/merge_requests/12',
            replyPostId: 'post-1',
            threadPostId: 'root-1',
            authorUserId: 'user-1',
            channelId: 'channel-1',
        });
    });
});
