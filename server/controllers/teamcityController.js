const express = require('express');
const moment = require('moment-timezone');
const {
    getAllNotifications,
    getNotificationById,
    createNotification,
    updateNotification,
    deleteNotification
} = require('../../db/models/teamcityBuildNotifications');
const TeamCityService = require('../../services/teamcityService');
const { getChannelById } = require('../../mattermost/utils');
const logger = require('../../logger');

const router = express.Router();

// Страница со списком настроек
router.get('/', async (req, res) => {
    try {
        const user_id = req.query.user_id || req.user?.mattermostUserId;
        const notifications = await getAllNotifications();
        res.render('teamcitySettings', { notifications, status: req.query.status, moment });
    } catch (error) {
        logger.error(`[TeamCityController] Ошибка при получении списка настроек: ${error.message}`);
        res.render('teamcitySettings', { notifications: [], status: 'error', moment });
    }
});

// Страница создания/редактирования настройки
router.get('/form', async (req, res) => {
    const { id } = req.query;
    let notification = null;

    if (id) {
        try {
            notification = await getNotificationById(id);
        } catch (error) {
            logger.error(`[TeamCityController] Ошибка при получении настройки ${id}: ${error.message}`);
        }
    }

    res.render('teamcityForm', { notification, status: req.query.status });
});

// Создание новой настройки
router.post('/create', async (req, res) => {
    try {
        const {
            build_config_id,
            build_config_name,
            channel_id,
            notify_on = 'all',
            is_enabled
        } = req.body;

        // Валидация
        if (!build_config_id || !channel_id) {
            return res.redirect('/teamcity/form?status=error&message=Заполните обязательные поля');
        }

        // Проверяем существование канала
        const channel = await getChannelById(channel_id);
        if (!channel) {
            return res.redirect('/teamcity/form?status=error&message=Канал не найден');
        }

        // Если build_config_name не указан, пытаемся получить из TeamCity
        let configName = build_config_name;
        if (!configName) {
            try {
                const buildConfig = await TeamCityService.getBuildConfig(build_config_id);
                if (buildConfig) {
                    configName = buildConfig.name || build_config_id;
                } else {
                    configName = build_config_id;
                }
            } catch (error) {
                logger.warn(`[TeamCityController] Не удалось получить название конфигурации: ${error.message}`);
                configName = build_config_id;
            }
        }

        // По умолчанию настройка включена, если checkbox отмечен
        const enabled = is_enabled === 'true' || is_enabled === true || is_enabled === 'on';

        const id = await createNotification({
            build_config_id: build_config_id.trim(),
            build_config_name: configName,
            channel_id: channel_id.trim(),
            channel_name: channel.name || channel.display_name,
            notify_on,
            is_enabled: enabled
        });

        res.redirect(`/teamcity?status=success&message=Настройка создана`);
    } catch (error) {
        logger.error(`[TeamCityController] Ошибка при создании настройки: ${error.message}`);
        res.redirect('/teamcity/form?status=error&message=Ошибка при создании настройки');
    }
});

// Обновление настройки
router.post('/update', async (req, res) => {
    try {
        const {
            id,
            build_config_id,
            build_config_name,
            channel_id,
            notify_on,
            is_enabled
        } = req.body;

        if (!id) {
            return res.redirect('/teamcity?status=error&message=ID настройки не указан');
        }

        // Проверяем существование канала, если он указан
        let channelName = null;
        if (channel_id) {
            const channel = await getChannelById(channel_id);
            if (!channel) {
                return res.redirect(`/teamcity/form?id=${id}&status=error&message=Канал не найден`);
            }
            channelName = channel.name || channel.display_name;
        }

        // Если build_config_name не указан, пытаемся получить из TeamCity
        let configName = build_config_name;
        if (!configName && build_config_id) {
            try {
                const buildConfig = await TeamCityService.getBuildConfig(build_config_id);
                if (buildConfig) {
                    configName = buildConfig.name || build_config_id;
                } else {
                    configName = build_config_id;
                }
            } catch (error) {
                logger.warn(`[TeamCityController] Не удалось получить название конфигурации: ${error.message}`);
                configName = build_config_id;
            }
        }

        const updateData = {};
        if (build_config_id !== undefined) updateData.build_config_id = build_config_id.trim();
        if (configName !== undefined) updateData.build_config_name = configName;
        if (channel_id !== undefined) updateData.channel_id = channel_id.trim();
        if (channelName !== undefined) updateData.channel_name = channelName;
        if (notify_on !== undefined) updateData.notify_on = notify_on;
        // Обрабатываем checkbox: если он не отмечен, он не отправляется в форме
        // Поэтому если is_enabled undefined, значит checkbox не отмечен
        if (is_enabled !== undefined) {
            updateData.is_enabled = is_enabled === 'true' || is_enabled === true || is_enabled === 'on';
        } else {
            // Если checkbox не отправлен, значит он не отмечен
            updateData.is_enabled = false;
        }

        await updateNotification(id, updateData);

        res.redirect(`/teamcity?status=success&message=Настройка обновлена`);
    } catch (error) {
        logger.error(`[TeamCityController] Ошибка при обновлении настройки: ${error.message}`);
        res.redirect(`/teamcity/form?id=${req.body.id}&status=error&message=Ошибка при обновлении настройки`);
    }
});

// Удаление настройки
router.post('/delete', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.redirect('/teamcity?status=error&message=ID настройки не указан');
        }

        await deleteNotification(id);
        res.redirect('/teamcity?status=success&message=Настройка удалена');
    } catch (error) {
        logger.error(`[TeamCityController] Ошибка при удалении настройки: ${error.message}`);
        res.redirect('/teamcity?status=error&message=Ошибка при удалении настройки');
    }
});

module.exports = router;

