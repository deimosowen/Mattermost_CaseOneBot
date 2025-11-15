const express = require('express');
const logger = require('../../logger');

const router = express.Router();

router.post('/webhook', async (req, res) => {
    try {
        logger.info('Received GitLab webhook:', req.body);
        logger.info('Headers:', req.headers);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
});

module.exports = router;