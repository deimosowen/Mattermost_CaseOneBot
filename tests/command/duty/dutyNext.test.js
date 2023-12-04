const {
    getCurrentDuty,
    getDutyUsers,
    setCurrentDuty,
    postMessage,
    logger,
    resources
} = require('./duty.setup');

const nextDutyCommand = require('../../../commands/duty/dutyNext');

describe('next duty command', () => {
    it('should handle no existing duty', async () => {
        getDutyUsers.mockResolvedValue([{ user_id: 'user1' }, { user_id: 'user2' }]);
        getCurrentDuty.mockResolvedValue(null);

        await nextDutyCommand({ channel_id: 'testChannel' });

        expect(postMessage).toHaveBeenCalledWith('testChannel', resources.noExistingError);
    });

    it('should switch to the next duty user and notify', async () => {
        getDutyUsers.mockResolvedValue([{ user_id: 'user1' }, { user_id: 'user2' }]);
        getCurrentDuty.mockResolvedValue({ user_id: 'user1' });

        await nextDutyCommand({ channel_id: 'testChannel' });

        expect(setCurrentDuty).toHaveBeenCalledWith('testChannel', 'user2');
        expect(postMessage).toHaveBeenCalledWith('testChannel', resources.nextNotification.replace('{user}', 'user2'));
    });

    it('should loop back to the first user after the last', async () => {
        getDutyUsers.mockResolvedValue([{ user_id: 'user1' }, { user_id: 'user2' }]);
        getCurrentDuty.mockResolvedValue({ user_id: 'user2' });

        await nextDutyCommand({ channel_id: 'testChannel' });

        expect(setCurrentDuty).toHaveBeenCalledWith('testChannel', 'user1');
        expect(postMessage).toHaveBeenCalledWith('testChannel', resources.nextNotification.replace('{user}', 'user1'));
    });

    it('should handle errors gracefully', async () => {
        getCurrentDuty.mockRejectedValue(new Error('Test error'));

        await nextDutyCommand({ channel_id: 'testChannel' });

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Test error'));
    });
});