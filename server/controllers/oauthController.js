const express = require('express');
const yandexService = require('../../services/yandexService');

const router = express.Router();

router.get('/yandexAuthCallback', async (req, res) => {
    try {
        const credentials = yandexService.getCredentials();
        res.render("yandexAuthCallback", {
            credentials: credentials
        });
    } catch (error) {
        return res.status(500).send('Bad Request: Something went wrong.');
    }
});

module.exports = router;