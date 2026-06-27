describe('mattermost utils', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('builds post permalink from post channel team', async () => {
        const client = {
            setUrl: jest.fn(),
            setToken: jest.fn(),
            getPost: jest.fn().mockResolvedValue({
                id: 'post-id',
                channel_id: 'channel-id',
            }),
            getChannel: jest.fn().mockResolvedValue({
                id: 'channel-id',
                team_id: 'team-id',
            }),
            getTeam: jest.fn().mockResolvedValue({
                id: 'team-id',
                name: 'alpha',
            }),
        };
        const wsClient = {
            initialize: jest.fn(),
        };

        jest.doMock('../../config', () => ({
            API_BASE_URL: 'mmdev.pravo.tech',
            BOT_TOKEN: 'bot-token',
        }));
        jest.doMock('@mattermost/client', () => ({
            Client4: jest.fn(() => client),
            WebSocketClient: jest.fn(() => wsClient),
        }));
        jest.doMock('../../logger', () => ({
            error: jest.fn(),
        }));

        const mattermost = require('../../mattermost/utils');

        await expect(mattermost.getPostPermalink('post-id')).resolves.toBe('https://mmdev.pravo.tech/alpha/pl/post-id');
        expect(client.getPost).toHaveBeenCalledWith('post-id');
        expect(client.getChannel).toHaveBeenCalledWith('channel-id');
        expect(client.getTeam).toHaveBeenCalledWith('team-id');
    });
});
