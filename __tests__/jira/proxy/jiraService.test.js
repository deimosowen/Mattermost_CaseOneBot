const jiraService = require('../../../jira/proxy/services/jiraService');

describe('jira proxy service', () => {
    describe('changeStatus', () => {
        test('sets required AI usage field before transitioning issue', async () => {
            const jiraClient = {
                listTransitions: jest.fn().mockResolvedValue({
                    transitions: [
                        { id: '11', to: { name: 'In Progress' } },
                        { id: '31', to: { name: 'Done' } },
                    ],
                }),
                updateIssue: jest.fn().mockResolvedValue(undefined),
                transitionIssue: jest.fn().mockResolvedValue(undefined),
            };

            await jiraService.changeStatus(jiraClient, 'CASEM-1', 'Done');

            expect(jiraClient.updateIssue).toHaveBeenCalledWith('CASEM-1', {
                fields: {
                    customfield_19260: { id: '13420' },
                },
            });
            expect(jiraClient.transitionIssue).toHaveBeenCalledWith('CASEM-1', {
                transition: { id: '31' },
            });
            expect(jiraClient.updateIssue.mock.invocationCallOrder[0])
                .toBeLessThan(jiraClient.transitionIssue.mock.invocationCallOrder[0]);
        });
    });
});
