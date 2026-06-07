const express = require('express');
const {
    getAvailableReviewChannelsForUser,
    saveReviewChannelExclusionsForUser
} = require('../../services/reviewChannelAvailabilityService');
const logger = require('../../logger');

const router = express.Router();

router.get('/', async (req, res) => {
    const userId = req.user?.mattermostUserId;

    if (!userId) {
        return res.status(400).render('profile', {
            error: 'Не удалось определить пользователя Mattermost',
            success: false,
            sections: [],
            reviewChannels: []
        });
    }

    try {
        const reviewChannels = await getAvailableReviewChannelsForUser(userId, {
            includeExcluded: true,
            includeNames: true
        });

        res.render('profile', {
            error: null,
            success: req.query.success === 'true',
            sections: [
                {
                    key: 'review-publications',
                    title: 'Ревью-публикации',
                    icon: 'bi-send-check'
                }
            ],
            reviewChannels
        });
    } catch (error) {
        logger.error(`Error loading profile for ${userId}: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).render('profile', {
            error: 'Ошибка при загрузке настроек',
            success: false,
            sections: [],
            reviewChannels: []
        });
    }
});

router.post('/review-publications', async (req, res) => {
    const userId = req.user?.mattermostUserId;
    if (!userId) {
        return res.status(400).send('Не удалось определить пользователя Mattermost');
    }

    try {
        const excludedChannelIds = Array.isArray(req.body.excluded_channel_ids)
            ? req.body.excluded_channel_ids
            : (req.body.excluded_channel_ids ? [req.body.excluded_channel_ids] : []);

        await saveReviewChannelExclusionsForUser(userId, excludedChannelIds);
        res.redirect('/profile?success=true');
    } catch (error) {
        logger.error(`Error saving profile review settings for ${userId}: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).send('Ошибка при сохранении настроек');
    }
});

module.exports = router;
