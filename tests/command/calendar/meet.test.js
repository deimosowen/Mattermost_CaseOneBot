const {
    google,
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
    it('should notify if user is not authorized', async () => {
        getUser.mockResolvedValueOnce(null);
        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: []
        };

        await meetCommand(mockData);

        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', resources.notAuthorized);
    });

    it('should create a meeting and return a link', async () => {
        getUser.mockResolvedValueOnce('user_1');
        google.calendar().events.insert.mockResolvedValueOnce({ data: { hangoutLink: 'testLink' } });

        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: ['@user1', 'Test Meeting', '30m']
        };

        await meetCommand(mockData);

        expect(google.calendar().events.insert).toHaveBeenCalledWith(expect.any(Object));
        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', expect.stringContaining('testLink'));
    });

    it('should create a meeting with default values when all arguments are empty', async () => {
        getUser.mockResolvedValueOnce('user_1');
        google.calendar().events.insert.mockResolvedValueOnce({ data: { hangoutLink: 'testLink' } });

        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: []
        };

        await meetCommand(mockData);

        const now = new Date();
        const expectedStart = new Date(now.getTime());
        const expectedEnd = new Date(now.getTime() + 15 * 60 * 1000);

        const insertCallArg = google.calendar().events.insert.mock.calls[0][0];

        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', expect.stringContaining('testLink'));
        expect(insertCallArg.resource.attendees).toEqual([authorMock]);
        expect(insertCallArg.resource.summary).toBe(resources.defaultMeetingSummary);
        expect(insertCallArg.resource.start.dateTime).toBe(expectedStart.toISOString());
        expect(insertCallArg.resource.end.dateTime).toBe(expectedEnd.toISOString());
    });

    it('should create a meeting with default summary and duration when only users are provided', async () => {
        const mockUser1 = {
            email: 'user1@example.com',
            first_name: 'Jill',
            last_name: 'Doe'
        };

        const mockUser2 = {
            email: 'user2@example.com',
            first_name: 'Jane',
            last_name: 'Smith'
        };

        getUserByUsername.mockResolvedValueOnce(mockUser1);
        getUserByUsername.mockResolvedValueOnce(mockUser2);
        getUser.mockResolvedValueOnce('user_1');
        google.calendar().events.insert.mockResolvedValueOnce({ data: { hangoutLink: 'testLink' } });

        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: ['@user1,@user2']
        };

        await meetCommand(mockData);

        const expectedAttendees = [
            { name: `${mockUser1.first_name} ${mockUser1.last_name}`, email: mockUser1.email },
            { name: `${mockUser2.first_name} ${mockUser2.last_name}`, email: mockUser2.email }
        ];

        const now = new Date();
        const expectedStart = new Date(now.getTime());
        const expectedEnd = new Date(now.getTime() + 15 * 60 * 1000);

        const insertCallArg = google.calendar().events.insert.mock.calls[0][0];

        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', expect.stringContaining('testLink'));
        expect(insertCallArg.resource.summary).toBe(resources.meetingSummaryWithUsers.replace('{users}', expectedAttendees.map(user => user.name).join(', ')));
        expect(insertCallArg.resource.attendees).toEqual([authorMock, ...expectedAttendees]);
        expect(insertCallArg.resource.start.dateTime).toBe(expectedStart.toISOString());
        expect(insertCallArg.resource.end.dateTime).toBe(expectedEnd.toISOString());
    });

    it('should create a meeting with default duration and no attendees when only summary is provided', async () => {
        getUser.mockResolvedValueOnce('user_1');
        google.calendar().events.insert.mockResolvedValueOnce({ data: { hangoutLink: 'testLink' } });

        const meetName = 'Test Meeting';
        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: ['', meetName]
        };

        await meetCommand(mockData);

        const now = new Date();
        const expectedStart = new Date(now.getTime());
        const expectedEnd = new Date(now.getTime() + 15 * 60 * 1000);

        const insertCallArg = google.calendar().events.insert.mock.calls[0][0];

        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', expect.stringContaining('testLink'));
        expect(insertCallArg.resource.summary).toBe(meetName);
        expect(insertCallArg.resource.attendees).toEqual([authorMock]);
        expect(insertCallArg.resource.start.dateTime).toBe(expectedStart.toISOString());
        expect(insertCallArg.resource.end.dateTime).toBe(expectedEnd.toISOString());
    });

    it('should create a meeting with default summary and specified duration when only duration is provided', async () => {
        getUser.mockResolvedValueOnce('user_1');
        google.calendar().events.insert.mockResolvedValueOnce({ data: { hangoutLink: 'testLink' } });

        const mockData = {
            user_id: 'testUserId',
            post_id: 'testPostId',
            args: ['', '', '30m']
        };

        await meetCommand(mockData);

        const now = new Date();
        const expectedStart = new Date(now.getTime());
        const expectedEnd = new Date(now.getTime() + 30 * 60 * 1000);

        const insertCallArg = google.calendar().events.insert.mock.calls[0][0];

        expect(postMessageInTreed).toHaveBeenCalledWith('testPostId', expect.stringContaining('testLink'));
        expect(insertCallArg.resource.summary).toBe(resources.defaultMeetingSummary);
        expect(insertCallArg.resource.attendees).toEqual([authorMock]);
        expect(insertCallArg.resource.start.dateTime).toBe(expectedStart.toISOString());
        expect(insertCallArg.resource.end.dateTime).toBe(expectedEnd.toISOString());
    });
});