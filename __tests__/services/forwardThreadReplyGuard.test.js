jest.mock('../../mattermost/utils', () => ({
    getPostThread: jest.fn(),
    getAllChannelMembers: jest.fn(),
}));

jest.mock('../../logger', () => ({
    error: jest.fn(),
}));

const { getPostThread, getAllChannelMembers } = require('../../mattermost/utils');
const { hasTargetChannelReplyInThread } = require('../../services/forwardThreadReplyGuard');

describe('forwardThreadReplyGuard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getAllChannelMembers.mockResolvedValue([
            { user_id: 'target-user' },
            { user_id: 'another-target-user' },
        ]);
    });

    test('returns true when target channel member replied in source thread', async () => {
        getPostThread.mockResolvedValue({
            posts: {
                root: { id: 'root-post', user_id: 'source-user' },
                reply: { id: 'reply-post', root_id: 'root-post', user_id: 'target-user' },
            },
        });

        await expect(hasTargetChannelReplyInThread('root-post', 'target-channel')).resolves.toBe(true);
    });

    test('ignores root post even if author is a target channel member', async () => {
        getPostThread.mockResolvedValue({
            posts: {
                root: { id: 'root-post', user_id: 'target-user' },
            },
        });

        await expect(hasTargetChannelReplyInThread('root-post', 'target-channel')).resolves.toBe(false);
    });

    test('returns false when only non-target users replied', async () => {
        getPostThread.mockResolvedValue({
            posts: {
                root: { id: 'root-post', user_id: 'source-user' },
                reply: { id: 'reply-post', root_id: 'root-post', user_id: 'source-user-2' },
            },
        });

        await expect(hasTargetChannelReplyInThread('root-post', 'target-channel')).resolves.toBe(false);
    });
});
