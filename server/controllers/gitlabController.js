const express = require('express');
const logger = require('../../logger').child('webhook');
const gitlabWebhookService = require('../../services/gitlabWebhookService');

const router = express.Router();

router.post('/webhook', async (req, res) => {
    try {
        logger.info('Получен GitLab webhook');
        gitlabWebhookService.handleWebhook(req.body, req.headers).catch(err => {
            logger.error(`Ошибка: ${err.message}`);
        });
        res.status(200).json({ ok: true });
    } catch (error) {
        logger.error(`Ошибка: ${error.message}`);
        res.status(200).json({ ok: true });
    }
});

module.exports = router;