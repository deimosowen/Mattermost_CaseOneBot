const { selectToolGroups, selectFunctions } = require('../../chatgpt/toolSelector');
const { functions } = require('../../chatgpt/functions');
const { GROUP_FUNCTIONS } = require('../../chatgpt/functionGroups');

describe('toolSelector', () => {
    test('greeting uses only core tools', () => {
        const { groups } = selectToolGroups({ selectionText: 'Привет!' });
        expect(groups).toEqual(['core']);
    });

    test('unknown non-greeting text uses fallback groups', () => {
        const { groups } = selectToolGroups({ selectionText: 'Расскажи что-нибудь полезное' });
        expect(groups).toContain('core');
        expect(groups).toContain('duty');
        expect(groups).toContain('calendar');
    });

    test('duty question selects duty group', () => {
        const { groups } = selectToolGroups({ selectionText: 'Кто дежурный на проде?' });
        expect(groups).toContain('duty');
    });

    test('reviewer change selects jira tools', () => {
        const selected = selectFunctions(functions, {
            selectionText: 'Смени ревьюера на @dev',
            hasPost: true,
        });
        const names = selected.map((func) => func.name);

        expect(names).toContain('changeReviewReviewer');
        expect(names).toContain('reopenReviewTask');
    });

    test('reop request selects jira tools', () => {
        const selected = selectFunctions(functions, {
            selectionText: 'Реопни задачу, нужны правки',
            hasPost: true,
        });
        const names = selected.map((func) => func.name);

        expect(names).toContain('reopenReviewTask');
    });

    test('thread follow-up uses recent user history', () => {
        const history = [
            { role: 'user', content: '@bot пишет: Привет' },
            { role: 'assistant', content: 'Привет!' },
        ];
        const { groups } = selectToolGroups({
            history,
            selectionText: 'А на проде?',
        });
        expect(groups).toContain('duty');
    });

    test('reminder without post excludes post-dependent tools', () => {
        const selected = selectFunctions(functions, {
            selectionText: 'Кто дежурный?',
            hasPost: false,
        });
        const names = selected.map((func) => func.name);
        expect(names).not.toContain('inviteToChannel');
        expect(names).not.toContain('createImages');
    });

    test('tool groups reference existing functions only', () => {
        const existingFunctionNames = new Set(functions.map((func) => func.name));
        const missingFunctionNames = Object.values(GROUP_FUNCTIONS)
            .flat()
            .filter((name) => !existingFunctionNames.has(name));

        expect(missingFunctionNames).toEqual([]);
    });
});
