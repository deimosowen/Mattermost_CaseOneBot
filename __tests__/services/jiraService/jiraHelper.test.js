const { extractTaskNumber } = require('../../../services/jiraService/jiraHelper');

describe('jiraHelper', () => {
    test('extracts CASEM task from in-review root message', () => {
        expect(extractTaskNumber({ message: '**IN REVIEW** CASEM-123 Some task' })).toBe('CASEM-123');
    });

    test('extracts REN task from in-review root message', () => {
        expect(extractTaskNumber({ message: 'IN REVIEW REN-456 Some task' })).toBe('REN-456');
    });

    test('does not extract task from non-review message', () => {
        expect(extractTaskNumber({ message: 'CASEM-123 Some task' })).toBeNull();
    });
});
