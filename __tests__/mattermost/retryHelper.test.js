jest.mock('../../logger', () => ({
    error: jest.fn(),
}));

const logger = require('../../logger');
const { retry } = require('../../mattermost/retryHelper');

describe('retryHelper', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('does not retry or error-log expected client errors', async () => {
        const error = new Error('not found');
        error.status_code = 404;
        const fn = jest.fn().mockRejectedValue(error);

        await expect(retry(fn, [], 2, 1)).rejects.toBe(error);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('retries and logs transient errors', async () => {
        const error = new Error('server unavailable');
        error.status_code = 503;
        const fn = jest.fn()
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce('ok');

        await expect(retry(fn, [], 2, 1)).resolves.toBe('ok');

        expect(fn).toHaveBeenCalledTimes(2);
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});
