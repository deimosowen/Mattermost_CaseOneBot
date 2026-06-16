const express = require('express');
const requireAdmin = require('../middleware/admin');
const logger = require('../../logger');
const adminAccessService = require('../../services/admin/adminAccessService');
const inviteChannelService = require('../../services/admin/adminInviteChannelService');
const reviewChannelService = require('../../services/admin/adminReviewChannelService');
const logService = require('../../services/admin/adminLogService');
const systemInfoService = require('../../services/admin/adminSystemInfoService');
const healthService = require('../../services/admin/adminHealthService');
const mergeTrackingService = require('../../services/admin/adminMergeTrackingService');

const router = express.Router();

router.use(requireAdmin);

function getStatusCode(error, fallback = 500) {
    return error.statusCode || fallback;
}

function logError(context, error) {
    logger.error(`${context}: ${error.message}${error.stack ? `\nStack trace:\n${error.stack}` : ''}`);
}

function renderAdminError(res, view, message, data = {}) {
    res.status(500).render(view, {
        error: message,
        ...data,
    });
}

router.get('/', (req, res) => {
    res.render('admin', {
        user: req.user,
        adminInfo: {
            mattermostUserId: req.user?.mattermostUserId,
            yandexId: req.user?.id,
            email: req.user?.email,
        },
    });
});

router.get('/users', async (req, res) => {
    try {
        const data = await adminAccessService.getUsersPageData();
        res.render('adminUsers', {
            error: null,
            ...data,
        });
    } catch (error) {
        logError('Error in admin users page', error);
        renderAdminError(res, 'adminUsers', 'Ошибка при загрузке пользователей и групп', {
            users: [],
            groups: [],
            menuItems: adminAccessService.getMenuItems(),
        });
    }
});

router.put('/api/users/:mattermostUserId', async (req, res) => {
    try {
        const result = await adminAccessService.updateManagedUser(req.params.mattermostUserId, req.body);
        res.json({ success: true, id: result.id, message: 'Пользователь обновлен' });
    } catch (error) {
        logger.error(`Error updating admin user: ${error.message}`);
        res.status(getStatusCode(error, 400)).json({ error: error.message });
    }
});

router.delete('/api/users/:id', async (req, res) => {
    try {
        await adminAccessService.deleteManagedUser(req.params.id);
        res.json({ success: true, message: 'Пользователь удален' });
    } catch (error) {
        logger.error(`Error deleting admin user: ${error.message}`);
        res.status(getStatusCode(error, 400)).json({ error: error.message });
    }
});

router.post('/api/groups', async (req, res) => {
    try {
        const id = await adminAccessService.createAccessGroup(req.body);
        res.json({ success: true, id, message: 'Группа создана' });
    } catch (error) {
        logger.error(`Error creating admin group: ${error.message}`);
        res.status(getStatusCode(error, 400)).json({ error: error.message });
    }
});

router.put('/api/groups/:id', async (req, res) => {
    try {
        await adminAccessService.updateAccessGroup(req.params.id, req.body);
        res.json({ success: true, message: 'Группа обновлена' });
    } catch (error) {
        logger.error(`Error updating admin group: ${error.message}`);
        res.status(getStatusCode(error, 400)).json({ error: error.message });
    }
});

router.delete('/api/groups/:id', async (req, res) => {
    try {
        await adminAccessService.deleteAccessGroup(req.params.id);
        res.json({ success: true, message: 'Группа удалена' });
    } catch (error) {
        logger.error(`Error deleting admin group: ${error.message}`);
        res.status(getStatusCode(error, 400)).json({ error: error.message });
    }
});

router.get('/invite-channels', async (req, res) => {
    try {
        const channels = await inviteChannelService.getInviteChannelsPageData();
        res.render('adminInviteChannels', { error: null, channels });
    } catch (error) {
        logError('Error in admin invite channels', error);
        renderAdminError(res, 'adminInviteChannels', 'Ошибка при загрузке данных', { channels: [] });
    }
});

router.post('/api/invite-channels', async (req, res) => {
    try {
        const id = await inviteChannelService.createInviteChannel(req.body);
        res.json({ success: true, id, message: 'Конфигурация добавлена' });
    } catch (error) {
        logError('Error adding invite channel', error);
        res.status(getStatusCode(error)).json({ error: error.message });
    }
});

router.delete('/api/invite-channels/:id', async (req, res) => {
    try {
        await inviteChannelService.deleteInviteChannelConfig(req.params.id);
        res.json({ success: true, message: 'Конфигурация удалена' });
    } catch (error) {
        logger.error(`Error removing invite channel: ${error.message}`);
        res.status(getStatusCode(error)).json({ error: error.message });
    }
});

router.put('/api/invite-channels/:id', async (req, res) => {
    try {
        await inviteChannelService.updateInviteChannelConfig(req.params.id, req.body);
        res.json({ success: true, message: 'Конфигурация обновлена' });
    } catch (error) {
        logger.error(`Error updating invite channel: ${error.message}`);
        res.status(getStatusCode(error)).json({ error: error.message });
    }
});

router.get('/api/log-files', (req, res) => {
    try {
        res.json(logService.getLogFilesMetadata());
    } catch (error) {
        logger.error(`Error getting log files list: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/latest-log', (req, res) => {
    try {
        res.json(logService.getLatestLog({
            date: req.query.date,
            moduleName: req.query.module || 'app',
        }));
    } catch (error) {
        logger.error(`Error getting latest log: ${error.message}`);
        res.status(500).json({
            error: `Не удалось получить лог-файл: ${error.message}`,
            logFile: null,
            logContent: null,
        });
    }
});

router.get('/review-channels', async (req, res) => {
    try {
        const channels = await reviewChannelService.getReviewChannelsPageData();
        res.render('adminReviewChannels', { error: null, channels });
    } catch (error) {
        logError('Error in admin review channels', error);
        renderAdminError(res, 'adminReviewChannels', 'Ошибка при загрузке данных', { channels: [] });
    }
});

router.post('/api/review-channels', async (req, res) => {
    try {
        const id = await reviewChannelService.createReviewChannel(req.body);
        res.json({ success: true, id, message: 'Канал добавлен' });
    } catch (error) {
        logError('Error adding review channel', error);
        res.status(getStatusCode(error)).json({ error: error.message });
    }
});

router.delete('/api/review-channels/:id', async (req, res) => {
    try {
        await reviewChannelService.deleteReviewChannelConfig(req.params.id);
        res.json({ success: true, message: 'Канал удален' });
    } catch (error) {
        logger.error(`Error removing review channel: ${error.message}`);
        res.status(getStatusCode(error)).json({ error: error.message });
    }
});

router.get('/api/system-info', (req, res) => {
    try {
        res.json(systemInfoService.getSystemInfo());
    } catch (error) {
        logger.error(`Error in system-info endpoint: ${error.message}`);
        res.status(500).json({
            error: 'Ошибка при получении системной информации',
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString(),
        });
    }
});

router.get('/merge-tracking', (req, res) => {
    res.render('adminMergeTracking', mergeTrackingService.getMergeTrackingPageData());
});

router.get('/api/merge-tracking/features', async (req, res) => {
    try {
        const features = await mergeTrackingService.getMergeTrackingFeatures();
        res.json({ features });
    } catch (error) {
        logger.error(`Error getting merge tracking features: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/api/merge-tracking/features/:id', async (req, res) => {
    try {
        await mergeTrackingService.removeFeature(req.params.id);
        res.json({ success: true });
    } catch (error) {
        logger.error(`Error deleting feature: ${error.message}`);
        res.status(getStatusCode(error)).json({ error: error.message });
    }
});

router.delete('/api/merge-tracking/mrs/:id', async (req, res) => {
    try {
        await mergeTrackingService.removeFeatureMergeRequest(req.params.id);
        res.json({ success: true });
    } catch (error) {
        logger.error(`Error deleting MR: ${error.message}`);
        res.status(getStatusCode(error)).json({ error: error.message });
    }
});

router.post('/api/merge-tracking/mrs', async (req, res) => {
    try {
        await mergeTrackingService.addMergeRequestToFeature(req.body);
        res.json({ success: true });
    } catch (error) {
        logger.error(`Error adding MR: ${error.message}`);
        res.status(getStatusCode(error)).json({ error: error.message });
    }
});

router.post('/api/merge-tracking/features', async (req, res) => {
    try {
        const id = await mergeTrackingService.createFeature(req.body);
        res.json({ success: true, id });
    } catch (error) {
        logger.error(`Error adding feature: ${error.message}`);
        res.status(getStatusCode(error)).json({ error: error.message });
    }
});

router.get('/api/health', async (req, res) => {
    try {
        res.json(await healthService.getHealthChecks());
    } catch (error) {
        logger.error(`Error in health endpoint: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
