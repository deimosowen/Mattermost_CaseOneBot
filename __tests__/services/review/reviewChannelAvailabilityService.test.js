jest.mock('../../../db/models/reviewChannels', () => ({
    getAllReviewChannelIds: jest.fn(),
}));

jest.mock('../../../db/models/userReviewChannelSettings', () => ({
    getExcludedReviewChannelIds: jest.fn(),
    setExcludedReviewChannelIds: jest.fn(),
}));

jest.mock('../../../mattermost/utils', () => ({
    getChannelById: jest.fn(),
    getChannelMember: jest.fn(),
}));

jest.mock('../../../logger', () => ({
    warn: jest.fn(),
    error: jest.fn(),
}));

const { getAllReviewChannelIds } = require('../../../db/models/reviewChannels');
const {
    getExcludedReviewChannelIds,
    setExcludedReviewChannelIds
} = require('../../../db/models/userReviewChannelSettings');
const { getChannelById, getChannelMember } = require('../../../mattermost/utils');

const {
    getAvailableReviewChannelsForUser,
    getEnabledReviewChannelIdsForUser,
    saveReviewChannelExclusionsForUser
} = require('../../../services/reviewChannelAvailabilityService');

describe('reviewChannelAvailabilityService', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        getAllReviewChannelIds.mockResolvedValue(['channel-a', 'channel-b', 'channel-c']);
        getExcludedReviewChannelIds.mockResolvedValue(['channel-b']);
        getChannelMember.mockImplementation(async (channelId) => {
            if (channelId === 'channel-c') return null;
            return { user_id: 'user-1', channel_id: channelId };
        });
        getChannelById.mockImplementation(async (channelId) => ({
            id: channelId,
            display_name: `Name ${channelId}`,
        }));
        setExcludedReviewChannelIds.mockResolvedValue(['channel-b']);
    });

    test('возвращает только доступные и не исключенные каналы для отправки', async () => {
        const channelIds = await getEnabledReviewChannelIdsForUser('user-1');

        expect(channelIds).toEqual(['channel-a']);
        expect(getChannelMember).toHaveBeenCalledWith('channel-a', 'user-1');
        expect(getChannelMember).toHaveBeenCalledWith('channel-b', 'user-1');
        expect(getChannelMember).toHaveBeenCalledWith('channel-c', 'user-1');
    });

    test('для UI возвращает доступные каналы вместе со статусом исключения', async () => {
        const channels = await getAvailableReviewChannelsForUser('user-1', {
            includeExcluded: true,
            includeNames: true,
        });

        expect(channels).toEqual([
            { id: 'channel-a', name: 'Name channel-a', isExcluded: false },
            { id: 'channel-b', name: 'Name channel-b', isExcluded: true },
        ]);
    });

    test('сохраняет только исключения из реально доступных пользователю каналов', async () => {
        await saveReviewChannelExclusionsForUser('user-1', ['channel-b', 'channel-c', 'unknown']);

        expect(setExcludedReviewChannelIds).toHaveBeenCalledWith('user-1', ['channel-b']);
    });
});
