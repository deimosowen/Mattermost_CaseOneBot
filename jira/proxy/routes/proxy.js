const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/', async (req, res) => {
    const { url, method = 'GET', headers = {}, params, data } = req.body;

    if (!url) {
        return res.status(400).send('Необходимо указать URL');
    }

    try {
        const response = await axios({
            url,
            method,
            headers,
            params,
            data,
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).send(error.toString());
    }
});

module.exports = router;
