jest.mock('../../logger', () => ({
    warn: jest.fn(),
}));

const OpenAIClientFactory = require('../../chatgpt/openAIClientFactory');
const logger = require('../../logger');

describe('OpenAIClientFactory', () => {
    test('rejects unsupported official v2 base URL', () => {
        expect(() => OpenAIClientFactory.normalizeBaseURL('https://api.openai.com/v2/')).toThrow(
            'OPENAI_BASE_URL=https://api.openai.com/v2 is not supported'
        );
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('keeps custom base URL', () => {
        expect(OpenAIClientFactory.normalizeBaseURL('https://example.test/openai/v1/')).toBe('https://example.test/openai/v1');
    });
});
