const express = require('express');
const FeatureService = require('../../services/featureService');
const logger = require('../../logger');

const router = express.Router();

router.get('/', async (req, res) => {
    const { status } = req.query;
    try {
        const user_id = req.query.user_id || req.user?.mattermostUserId;
        if (!user_id) {
            return res.status(400).send('User ID is required');
        }
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

router.get('/api/mr-labels', async (req, res) => {
    try {
        const { url, all } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const GitlabService = require('../../services/gitlabService');
        const { parseGitlabMrUrl } = require('../../services/gitlabService/gitlabHelper');
        
        const parsed = parseGitlabMrUrl(url);
        if (!parsed) {
            return res.status(400).json({ error: 'Invalid MR URL' });
        }

        const project = await GitlabService.getProjectByName(parsed.project);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Если запрашиваются все лейблы проекта
        if (all === 'true') {
            try {
                const allLabelsResult = await GitlabService.client.ProjectLabels.all(project.project_id);
                const allLabels = Array.isArray(allLabelsResult) ? allLabelsResult : [];
                return res.json({ allLabels });
            } catch (error) {
                logger.error(`Ошибка получения всех лейблов проекта ${project.project_id}:`, error);
                if (error.stack) {
                    logger.error(`Stack trace: ${error.stack}`);
                }
                return res.json({ allLabels: [] });
            }
        }

        const labels = await GitlabService.getMergeRequestLabels(url);

        if (labels === null) {
            return res.status(404).json({ error: 'MR not found or invalid URL' });
        }

        res.json({ labels });
    } catch (err) {
        logger.error('Ошибка получения лейблов MR:', err);
        if (err.stack) {
            logger.error(`Stack trace: ${err.stack}`);
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;