const { classifyByHeuristics } = require('../../../services/flakyTest/flakyTestClassifier');

jest.mock('../../../chatgpt/openAIClientFactory', () => ({
    isApiKeyExist: jest.fn(() => false),
}));
jest.mock('../../../logger', () => ({
    warn: jest.fn(),
}));

describe('flakyTestClassifier', () => {
    test('marks test as flaky when history alternates between failure and success', () => {
        const result = classifyByHeuristics({
            test: {
                name: 'CaseMap.Tests.SomeTest.ShouldPass',
                details: 'Timed out waiting for condition',
            },
            history: [
                { status: 'FAILURE' },
                { status: 'SUCCESS' },
                { status: 'FAILURE' },
            ],
            localEvents: [],
        });

        expect(result.is_flaky).toBe(true);
        expect(result.confidence).toBeGreaterThanOrEqual(0.55);
        expect(result.test_identity).toBe('casemap.tests.sometest.shouldpass');
    });
});
