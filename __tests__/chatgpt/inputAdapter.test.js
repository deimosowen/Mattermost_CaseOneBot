const { splitHistoryForResponseApi } = require('../../chatgpt/inputAdapter');

describe('inputAdapter', () => {
    test('moves system messages to instructions and keeps regular turns in input', () => {
        const result = splitHistoryForResponseApi([
            { role: 'system', content: 'Be concise.' },
            { role: 'user', content: 'Привет' },
            { role: 'assistant', content: 'Привет!' },
        ]);

        expect(result).toEqual({
            instructions: 'Be concise.',
            input: [
                { role: 'user', content: 'Привет' },
                { role: 'assistant', content: 'Привет!' },
            ],
        });
    });

    test('converts legacy chat image parts to Responses API input parts', () => {
        const result = splitHistoryForResponseApi([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Что на картинке?' },
                    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
                ],
            },
        ]);

        expect(result.input).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'input_text', text: 'Что на картинке?' },
                    { type: 'input_image', image_url: 'data:image/jpeg;base64,abc' },
                ],
            },
        ]);
    });
});
