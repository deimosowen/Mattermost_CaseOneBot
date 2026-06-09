const logger = require('../logger');

const isClientError = (error) => {
    const statusCode = error?.status_code || error?.status || error?.response?.status;
    return statusCode >= 400 && statusCode < 500 && statusCode !== 429;
};

const retry = async (fn, args, retries = 3, delay = 1500) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn(...args);
        } catch (error) {
            if (isClientError(error)) {
                throw error;
            }

            logger.error(`${error.message}\nStack trace:\n${error.stack}`);
            if (i === retries - 1) throw error;
            await new Promise(res => setTimeout(res, delay));
        }
    }
};

const withRetry = (fn, retries = 3, delay = 1500) => {
    return async (...args) => {
        return retry(fn, args, retries, delay);
    };
};

module.exports = {
    retry,
    withRetry
};
