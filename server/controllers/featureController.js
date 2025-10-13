const express = require('express');
const FeatureService = require('../../services/featureService');
const logger = require('../../logger');

const router = express.Router();

router.get('/', async (req, res) => {
    const { user_id, status } = req.query;
    try {
        res.render('featureForm', { user_id, status: status });
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/ready', async (req, res) => {
    try {
        const data = {
            taskId: req.body.taskId?.trim(),
            taskName: req.body.taskName?.trim(),
            backPullRequestUrl: req.body.backPullRequestUrl?.trim() || null,
            frontPullRequestUrl: req.body.frontPullRequestUrl?.trim() || null,
            aqaPullRequestUrl: req.body.aqaPullRequestUrl?.trim() || null,
            mergeTaskId: Array.isArray(req.body.mergeTaskId)
                ? req.body.mergeTaskId
                : req.body.mergeTaskId
                    ? [req.body.mergeTaskId]
                    : [],
            description: req.body.description?.trim() || null
        };

        const result = await FeatureService.handleFeatureReady(data);

        res.redirect(`/feature?status=${result.status}`);
    } catch (err) {
        logger.error('Ошибка обработки формы /feature/ready:', err);
        res.redirect('/feature?status=error');
    }
});

module.exports = router;