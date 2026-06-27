const { scoreTask } = require('../../../services/flakyTest/flakyJiraMatcher');

jest.mock('../../../services/jiraService', () => ({
    searchTasksByJql: jest.fn(),
}));
jest.mock('../../../config', () => ({
    FLAKY_STABILIZATION_TASK_KEY: 'CASEM-93785',
}));
jest.mock('../../../logger', () => ({
    warn: jest.fn(),
}));

describe('flakyJiraMatcher', () => {
    test('scores exact test name match in summary', () => {
        const score = scoreTask(
            'CaseMap.Tests.Modules.Project.CreateEventTableBlockTest',
            {
                summary: '[Back] Падает тест CreateEventTableBlockTest',
                description: '',
            }
        );

        expect(score).toBeGreaterThanOrEqual(0.65);
    });

    test('scores full test name match in description', () => {
        const score = scoreTask(
            'CaseMap.Tests.Modules.Project.CreateEventTableBlockTest',
            {
                summary: '[Back] Падает тест',
                description: 'Падает тест - CaseMap.Tests.Modules.Project.CreateEventTableBlockTest',
            }
        );

        expect(score).toBe(1);
    });
});
