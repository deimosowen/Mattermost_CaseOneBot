const {
    getCurrentDuty,
    postMessage,
    logger,
    resources
} = require('./duty.setup');

const currentDutyCommand = require('../../../commands/duty/dutyCurrent');

describe('current duty command', () => {
    it('should notify if there is no current duty', async () => {
        getCurrentDuty.mockResolvedValueOnce(null);

        const mockData = {
            channel_id: 'testChannel'
        };

        await currentDutyCommand(mockData);

        expect(postMessage).toHaveBeenCalledWith('testChannel', resources.noCurrent);
    });

    it('should notify about the current duty', async () => {
        getCurrentDuty.mockResolvedValueOnce({ user_id: 'testUser' });

        const mockData = {
            channel_id: 'testChannel'
        };

        await currentDutyCommand(mockData);
        expect(postMessage).toHaveBeenCalledWith('testChannel', resources.currentNotification.replace('{user}', 'testUser'));
    });

    it('should handle errors gracefully', async () => {
        getCurrentDuty.mockRejectedValueOnce(new Error('Test error'));

        const mockData = {
            channel_id: 'testChannel'
        };

        await currentDutyCommand(mockData);

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Test error'));
    });
});