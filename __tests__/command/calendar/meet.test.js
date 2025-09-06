const {
    YandexApiManager,
    postMessageInTreed,
    getUserByUsername,
    getUser,
    resources
} = require('./calendar.setup');

const meetCommand = require('../../../commands/meet');
const authorMock = {
    name: 'John Doe',
    email: 'user@localhost'
}

describe('!meet command', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it.skip('should notify if user is not authorized', async () => {
        getUser.mockResolvedValueOnce(null);

        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: []
        };

        await meetCommand(mockData);

        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', resources.notAuthorized);
    });

    it.skip('should create a meeting and return a link', async () => {
        // Мокаем метод createEvent
        mockApi.createEvent.mockResolvedValue({ conference: { join_url: 'testLink' } });

        // Мокаем getApiInstance
        YandexApiManager.getApiInstance.mockResolvedValueOnce(mockApi);

        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: ['@user1', 'Test Meeting', '30m'],
        };

        await meetCommand(mockData);

        expect(YandexApiManager.getApiInstance).toHaveBeenCalledTimes(1);
        expect(YandexApiManager.getApiInstance).toHaveBeenCalledWith('testUserId');

        expect(mockApi.createEvent).toHaveBeenCalledWith(expect.objectContaining({
            summary: 'Test Meeting',
            attendees: expect.any(Array),
        }));

        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', expect.stringContaining('testLink'));
    });

    it.skip('should create a meeting with default values when arguments are empty', async () => {
        const mockApi = {
            createEvent: jest.fn().mockResolvedValue({ conference: { join_url: 'testLink' } })
        };

        getUser.mockResolvedValueOnce(authorMock);
        YandexApiManager.getApiInstance.mockResolvedValueOnce(mockApi);

        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: []
        };

        await meetCommand(mockData);

        expect(mockApi.createEvent).toHaveBeenCalledWith(expect.objectContaining({
            summary: resources.defaultMeetingSummary,
            attendees: [authorMock]
        }));
        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', expect.stringContaining('testLink'));
    });

    it.skip('should handle multiple attendees', async () => {
        const mockApi = {
            createEvent: jest.fn().mockResolvedValue({ conference: { join_url: 'testLink' } })
        };

        const mockUser1 = {
            id: 'user_01',
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'user1@example.com'
        };

        const mockUser2 = {
            id: 'user_02',
            first_name: 'Jim',
            last_name: 'Brown',
            email: 'user2@example.com'
        };

        getUserByUsername.mockResolvedValueOnce(mockUser1);
        getUserByUsername.mockResolvedValueOnce(mockUser2);
        getUser.mockResolvedValueOnce(authorMock);
        YandexApiManager.getApiInstance.mockResolvedValueOnce(mockApi);

        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: ['@user1,@user2']
        };

        await meetCommand(mockData);

        expect(mockApi.createEvent).toHaveBeenCalledWith(expect.objectContaining({
            attendees: expect.arrayContaining([
                { name: `${mockUser1.first_name} ${mockUser1.last_name}`, email: mockUser1.email },
                { name: `${mockUser2.first_name} ${mockUser2.last_name}`, email: mockUser2.email },
                { name: authorMock.name, email: authorMock.email }
            ])
        }));
        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', expect.stringContaining('testLink'));
    });

    it.skip('should handle errors gracefully', async () => {
        YandexApiManager.getApiInstance.mockRejectedValueOnce(new Error('Failed to create event'));

        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: []
        };

        await meetCommand(mockData);

        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', resources.errorCreatingMeeting);
    });
});