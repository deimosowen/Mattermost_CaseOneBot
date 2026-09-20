const { buildTools } = require('../../chatgpt/toolDefinitions');

describe('toolDefinitions', () => {
    test('builds Responses API function tools', () => {
        const tools = buildTools([
            {
                name: 'getCurrentDate',
                description: 'Возвращает текущую дату',
                parameters: { type: 'object', properties: {} },
            },
        ]);

        expect(tools).toEqual([
            {
                type: 'function',
                name: 'getCurrentDate',
                description: 'Возвращает текущую дату',
                parameters: { type: 'object', properties: {} },
                strict: false,
            },
        ]);
    });

    test('marks action tools as state-changing in description', () => {
        const tools = buildTools([
            {
                name: 'inviteToChannel',
                description: 'Пригласить пользователя в канал',
                parameters: { type: 'object', properties: {} },
            },
        ]);

        expect(tools[0].description).toContain('меняет состояние');
    });
});
