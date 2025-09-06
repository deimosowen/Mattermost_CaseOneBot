const { postMessage, logger } = require('./duty.setup');
const resources = require('../../../resources');
const dutyService = require('../../../services/dutyService');
const nextDutyCommand = require('../../../commands/duty/dutyNext');

jest.mock('../../../services/dutyService');
jest.mock('../../../resources', () => ({
    duty: {
        noExistingError: "No existing duty.",
        nextNotification: "Next duty: {user}."
    }
}));

describe('next duty command', () => {
    it('should notify with next duty information', async () => {
        const nextDutyMessage = "Next duty: user2.";
        dutyService.changeNextDuty.mockResolvedValue(nextDutyMessage);
        await nextDutyCommand({ channel_id: 'testChannel' });
        expect(postMessage).toHaveBeenCalledWith('testChannel', nextDutyMessage);
    });

    it('should handle errors gracefully', async () => {
        const error = new Error('Test error');
        dutyService.changeNextDuty.mockRejectedValue(error);
        await nextDutyCommand({ channel_id: 'testChannel' });
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Test error'));
    });
});