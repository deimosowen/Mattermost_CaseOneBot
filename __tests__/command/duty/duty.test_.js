const {
    cancelCronJob,
    getDutySchedule,
    deleteDutySchedule,
    deleteAllDutyUsers,
    postMessage,
    isValidCron,
    deleteCurrentDuty,
    setDutySchedule,
    addDutyUser,
    taskType,
    resources
} = require('./duty.setup');

const dutyCommand = require('../../../commands/duty/duty');

describe('duty command', () => {
    it('should notify if schedule is missing', async () => {
        const mockData = {
            channel_id: 'testChannel',
            args: []
        };

        await dutyCommand(mockData);

        expect(postMessage).toHaveBeenCalledWith('testChannel', resources.noScheduleError);
    });

    it('should notify if schedule is invalid', async () => {
        isValidCron.mockReturnValueOnce(false);

        const mockData = {
            channel_id: 'testChannel',
            args: ['invalid-cron', 'user1,user2']
        };

        await dutyCommand(mockData);

        expect(postMessage).toHaveBeenCalledWith('testChannel', resources.invalidScheduleError.replace('{schedule}', 'invalid-cron'));
    });

    it('should notify if user list is empty', async () => {
        isValidCron.mockReturnValueOnce(true);

        const mockData = {
            channel_id: 'testChannel',
            args: ['* * * * *', '']
        };

        await dutyCommand(mockData);

        expect(postMessage).toHaveBeenCalledWith('testChannel', resources.noUsersError);
    });

    it('should remove existing duty schedule and set a new one for a channel', async () => {
        isValidCron.mockReturnValueOnce(true);
        getDutySchedule.mockReturnValueOnce({ id: 'some-id', cron_schedule: '* * * * *' });

        const mockData = {
            channel_id: 'testChannel',
            args: ['* * * * *', 'user1,user2']
        };

        await dutyCommand(mockData);

        expect(cancelCronJob).toHaveBeenCalledWith('some-id', taskType.DUTY);
        expect(deleteDutySchedule).toHaveBeenCalledWith('testChannel');
        expect(deleteAllDutyUsers).toHaveBeenCalledWith('testChannel');
        expect(deleteCurrentDuty).toHaveBeenCalledWith('testChannel');
        expect(setDutySchedule).toHaveBeenCalledWith('testChannel', '* * * * *');
        expect(addDutyUser).toHaveBeenCalledTimes(2);
        expect(postMessage).toHaveBeenCalledWith('testChannel', resources.setSuccess);
    });
});