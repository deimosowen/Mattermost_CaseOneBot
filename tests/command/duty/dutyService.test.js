const { changeNextDuty } = require('../../../services/dutyService');
const { getDutyUsers, getCurrentDuty, setCurrentDuty } = require('../../../db/models/duty');
const resources = require('../../../resources');
const logger = require('../../../logger');

jest.mock('../../../db/models/duty');
jest.mock('../../../logger');
jest.mock('../../../resources', () => ({
    duty: {
        noUsersError: "No users available.",
        noExistingError: "No existing duty.",
        nextNotification: "Next duty: {user}."
    }
}));

describe('changeNextDuty function', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return an error message if no users are available', async () => {
        getDutyUsers.mockResolvedValue([]);

        const result = await changeNextDuty({ channel_id: 'testChannel' });

        expect(result).toBe(resources.duty.noUsersError);
        expect(getCurrentDuty).not.toHaveBeenCalled();
    });

    it('should return an error message if there is no current duty', async () => {
        getDutyUsers.mockResolvedValue([{ user_id: 'user1' }, { user_id: 'user2' }]);
        getCurrentDuty.mockResolvedValue(null);

        const result = await changeNextDuty({ channel_id: 'testChannel' });

        expect(result).toBe(resources.duty.noExistingError);
        expect(setCurrentDuty).not.toHaveBeenCalled();
    });

    it('should correctly rotate the duty to the next user', async () => {
        getDutyUsers.mockResolvedValue([{ user_id: 'user1' }, { user_id: 'user2' }]);
        getCurrentDuty.mockResolvedValue({ user_id: 'user1' });

        await changeNextDuty({ channel_id: 'testChannel' });

        expect(setCurrentDuty).toHaveBeenCalledWith('testChannel', 'user2');
    });

    it('should wrap around to the first user after the last', async () => {
        getDutyUsers.mockResolvedValue([{ user_id: 'user1' }, { user_id: 'user2' }]);
        getCurrentDuty.mockResolvedValue({ user_id: 'user2' });

        await changeNextDuty({ channel_id: 'testChannel' });

        expect(setCurrentDuty).toHaveBeenCalledWith('testChannel', 'user1');
    });

    it('should handle and log exceptions', async () => {
        const error = new Error('Database failure');
        getDutyUsers.mockRejectedValue(error);

        try {
            await changeNextDuty({ channel_id: 'testChannel' });
        } catch (e) {
            expect(e).toBe(error);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Database failure'));
        }
    });
});
