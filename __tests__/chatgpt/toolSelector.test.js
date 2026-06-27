const { selectToolGroups, selectFunctions } = require('../../chatgpt/toolSelector');
const { functions } = require('../../chatgpt/functions');
const { GROUP_FUNCTIONS, ALWAYS_ENABLED_FUNCTIONS } = require('../../chatgpt/functionGroups');

describe('toolSelector', () => {
    test('greeting uses only core tools', () => {
        const { groups } = selectToolGroups({ selectionText: 'Привет!' });
        expect(groups).toEqual(['core']);
    });

    test('always-enabled functions are selected without matched domain groups', () => {
        const selected = selectFunctions(functions, {
            selectionText: 'Привет!',
            hasPost: true,
        });
        const names = selected.map((func) => func.name);

        expect(names).toContain('getCurrentDate');
        expect(names).toContain('setContextData');
        expect(names).not.toContain('getCurrentDuty');
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

    test('feature chat invite request selects invite tools', () => {
        const selected = selectFunctions(functions, {
            selectionText: 'добавь в фича-чат https://mchat.pravo.tech/company/channels/c1_ud_procedure_deadlines',
            hasPost: true,
        });
        const names = selected.map((func) => func.name);

        expect(names).toContain('inviteToChannel');
    });

    test('channel name invite request selects invite tools', () => {
        const selected = selectFunctions(functions, {
            selectionText: 'пригласи в канал c1_fr_autofac',
            hasPost: true,
        });
        const names = selected.map((func) => func.name);

        expect(names).toContain('inviteToChannel');
    });

    test('invite follow-up uses recent channel link from history', () => {
        const history = [
            {
                role: 'user',
                content: '@bot пишет: добавь в фича-чат https://mchat.pravo.tech/company/channels/c1_ud_procedure_deadlines',
            },
        ];
        const { groups } = selectToolGroups({
            history,
            selectionText: 'добавь меня в этот чат',
            hasPost: true,
        });

        expect(groups).toContain('invite');
    });

    test('broad commands question selects full command help', () => {
        const selected = selectFunctions(functions, {
            selectionText: 'какие команды ты знаешь',
            hasPost: true,
        });
        const names = selected.map((func) => func.name);

        expect(names).toContain('describeAllCommands');
    });

    test('full command help mentions commands outside specialized help groups', async () => {
        const describeAllCommands = functions.find((func) => func.name === 'describeAllCommands');

        const result = await describeAllCommands.function();

        expect(result.data).toContain('!ping');
        expect(result.data).toContain('!review');
        expect(result.data).toContain('!review-settings');
        expect(result.data).toContain('!sendAs');
        expect(result.data).toContain('!log');
        expect(result.data).toContain('!r');
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

    test('always-enabled tools reference existing functions only', () => {
        const existingFunctionNames = new Set(functions.map((func) => func.name));
        const missingFunctionNames = [...ALWAYS_ENABLED_FUNCTIONS]
            .filter((name) => !existingFunctionNames.has(name));

        expect(missingFunctionNames).toEqual([]);
    });
});
