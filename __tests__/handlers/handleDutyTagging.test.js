jest.mock('../../mattermost/utils', () => ({
    postMessageInTreed: jest.fn(),
    getChannelById: jest.fn(),
    getUserByUsername: jest.fn(),
}));

jest.mock('../../db/models/duty', () => ({
    getAllActiveDutyTagSettings: jest.fn(),
    getCurrentDuty: jest.fn(),
}));

jest.mock('../../services/dutyService', () => ({
    getNextDuty: jest.fn(),
}));

jest.mock('../../logger', () => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { postMessageInTreed, getChannelById, getUserByUsername } = require('../../mattermost/utils');
const { getAllActiveDutyTagSettings, getCurrentDuty } = require('../../db/models/duty');
const { getNextDuty } = require('../../services/dutyService');
const handleDutyTagging = require('../../handlers/handleDutyTagging');

describe('handleDutyTagging', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        getChannelById.mockResolvedValue({ display_name: 'project-channel' });
        getUserByUsername.mockImplementation(async (username) => ({ id: `${username}-id` }));
        getNextDuty.mockResolvedValue({ user_id: '@next-user' });
    });

    test('шаблон next_duty_mention не блокируется текущим дежурным', async () => {
        getAllActiveDutyTagSettings.mockResolvedValue([{
            tag: 'c1-back',
            channel_id: 'duty-channel',
            channel_prefix: null,
            allow_bots: true,
            excluded_user_ids: ['current-user-id'],
            message_template: '{next_duty_mention}',
        }]);

        await handleDutyTagging(
            {
                id: 'post-id',
                root_id: 'post-id',
                channel_id: 'source-channel',
                message: 'Нужен c1-back',
                props: {},
            },
            { channel_name: 'project-channel' }
        );

        expect(getCurrentDuty).not.toHaveBeenCalled();
        expect(getNextDuty).toHaveBeenCalledWith('duty-channel');
        expect(postMessageInTreed).toHaveBeenCalledWith('post-id', '@next-user');
    });
});
