const flakyTest = require('../services/flakyTest');
const logger = require('../logger');

module.exports = async (post) => {
    try {
        await flakyTest.handleTriageResponse(post);
    } catch (error) {
        logger.error(`[FlakyTriageResponse] ${error.message}`);
    }
};
