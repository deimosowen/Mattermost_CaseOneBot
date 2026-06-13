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
});
