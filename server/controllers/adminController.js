const express = require('express');
const requireAdmin = require('../middleware/admin');
const logger = require('../../logger');
const {
    listUsers,
    listGroups,
    upsertUserAccess,
    deleteUser,
    createGroup,
    updateGroup,
    deleteGroup,
    getMenuItems,
    sanitizeMenuKeys
} = require('../../db/models/accessControl');
const { ADMIN_ID } = require('../../config');

const router = express.Router();

// Все маршруты требуют админ-прав
router.use(requireAdmin);

function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    return value === true || value === 'true' || value === '1' || value === 'on' || value === 1;
}

function parsePermissions(value) {
    if (!value) return [];
    return sanitizeMenuKeys(Array.isArray(value) ? value : [value]);
}

// Тестовая страница админа
router.get('/', (req, res) => {
    res.render('admin', {
        user: req.user,
        adminInfo: {
            mattermostUserId: req.user?.mattermostUserId,
            yandexId: req.user?.id,
            email: req.user?.email
        }
    });
});

// Страница управления пользователями и группами
router.get('/users', async (req, res) => {
    try {
        const [users, groups] = await Promise.all([
            listUsers(),
            listGroups()
        ]);

        res.render('adminUsers', {
            error: null,
            users,
            groups,
            menuItems: getMenuItems()
        });
    } catch (error) {
        logger.error(`Error in admin users page: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).render('adminUsers', {
            error: 'Ошибка при загрузке пользователей и групп',
            users: [],
            groups: [],
            menuItems: getMenuItems()
        });
    }
});

// API: обновить группу/статус пользователя
router.put('/api/users/:mattermostUserId', async (req, res) => {
    try {
        const result = await upsertUserAccess(req.params.mattermostUserId, {
            group_id: parseInt(req.body.group_id, 10),
            is_enabled: parseBoolean(req.body.is_enabled, false)
        });

        res.json({ success: true, id: result.id, message: 'Пользователь обновлен' });
    } catch (error) {
        logger.error(`Error updating admin user: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

// API: удалить пользователя из управления доступом
router.delete('/api/users/:id', async (req, res) => {
    try {
        const users = await listUsers();
        const user = users.find((item) => item.id === parseInt(req.params.id, 10));
        if (user?.mattermost_user_id && ADMIN_ID && user.mattermost_user_id === ADMIN_ID) {
            return res.status(400).json({ error: 'Пользователя из ADMIN_ID нельзя удалить' });
        }

        const changes = await deleteUser(parseInt(req.params.id, 10));
        if (!changes) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({ success: true, message: 'Пользователь удален' });
    } catch (error) {
        logger.error(`Error deleting admin user: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

// API: создать группу
router.post('/api/groups', async (req, res) => {
    try {
        const id = await createGroup({
            name: req.body.name,
            description: req.body.description,
            is_admin: parseBoolean(req.body.is_admin, false),
            permissions: parsePermissions(req.body.permissions)
        });

        res.json({ success: true, id, message: 'Группа создана' });
    } catch (error) {
        logger.error(`Error creating admin group: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

// API: обновить группу
router.put('/api/groups/:id', async (req, res) => {
    try {
        const changes = await updateGroup(parseInt(req.params.id, 10), {
            name: req.body.name,
            description: req.body.description,
            is_admin: parseBoolean(req.body.is_admin, false),
            permissions: parsePermissions(req.body.permissions)
        });

        if (!changes) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }

        res.json({ success: true, message: 'Группа обновлена' });
    } catch (error) {
        logger.error(`Error updating admin group: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

// API: удалить группу
router.delete('/api/groups/:id', async (req, res) => {
    try {
        const changes = await deleteGroup(parseInt(req.params.id, 10));
        if (!changes) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }

        res.json({ success: true, message: 'Группа удалена' });
    } catch (error) {
        logger.error(`Error deleting admin group: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

// Страница управления каналами для приглашений
router.get('/invite-channels', async (req, res) => {
    try {
        const { getAllInviteChannels, getAllMainChannels } = require('../../db/models/inviteChannels');
        const { getChannelById } = require('../../mattermost/utils');

        logger.debug('Loading invite channels data...');
        const inviteChannels = await getAllInviteChannels();
        logger.debug(`Found ${inviteChannels.length} invite channel configurations`);

        const mainChannelIds = await getAllMainChannels();
        logger.debug(`Found ${mainChannelIds.length} unique main channels: ${mainChannelIds.join(', ')}`);

        // Группируем по основным каналам и получаем информацию о каналах
        const channelsMap = new Map();

        for (const mainChannelId of mainChannelIds) {
            try {
                const channel = await getChannelById(mainChannelId);
                const channelPrefixes = inviteChannels
                    .filter(ic => ic.main_channel_id === mainChannelId)
                    .map(ic => ({ id: ic.id, prefix: ic.prefix }));

                logger.debug(`Channel ${mainChannelId}: found ${channelPrefixes.length} prefixes`);

                channelsMap.set(mainChannelId, {
                    id: mainChannelId,
                    name: channel ? (channel.display_name || channel.name || mainChannelId) : mainChannelId,
                    prefixes: channelPrefixes
                });
            } catch (error) {
                logger.warn(`Could not get channel ${mainChannelId}:`, error);
                const channelPrefixes = inviteChannels
                    .filter(ic => ic.main_channel_id === mainChannelId)
                    .map(ic => ({ id: ic.id, prefix: ic.prefix }));

                channelsMap.set(mainChannelId, {
                    id: mainChannelId,
                    name: `Канал ${mainChannelId}`,
                    prefixes: channelPrefixes
                });
            }
        }

        const channelsArray = Array.from(channelsMap.values());
        logger.debug(`Rendering with ${channelsArray.length} channels`);

        res.render('adminInviteChannels', {
            error: null,
            channels: channelsArray
        });
    } catch (error) {
        logger.error(`Error in admin invite channels: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).render('adminInviteChannels', {
            error: 'Ошибка при загрузке данных',
            channels: []
        });
    }
});

// API: Добавление конфигурации канала и префикса
router.post('/api/invite-channels', async (req, res) => {
    try {
        const { main_channel_id, prefix } = req.body;

        if (!main_channel_id || !prefix) {
            return res.status(400).json({ error: 'Не указан main_channel_id или prefix' });
        }

        const { addInviteChannel, inviteChannelExists } = require('../../db/models/inviteChannels');

        // Проверяем, не существует ли уже такая конфигурация
        const exists = await inviteChannelExists(main_channel_id, prefix);
        if (exists) {
            return res.status(400).json({ error: 'Такая конфигурация уже существует' });
        }

        logger.debug(`Adding invite channel: main_channel_id=${main_channel_id}, prefix=${prefix}`);
        const id = await addInviteChannel(main_channel_id, prefix);
        logger.info(`Invite channel added successfully: id=${id}, main_channel_id=${main_channel_id}, prefix=${prefix}`);

        res.json({ success: true, id, message: 'Конфигурация добавлена' });
    } catch (error) {
        logger.error(`Error adding invite channel: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ error: error.message });
    }
});

// API: Удаление конфигурации
router.delete('/api/invite-channels/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { removeInviteChannel } = require('../../db/models/inviteChannels');

        const result = await removeInviteChannel(parseInt(id));
        if (result > 0) {
            res.json({ success: true, message: 'Конфигурация удалена' });
        } else {
            res.status(404).json({ error: 'Конфигурация не найдена' });
        }
    } catch (error) {
        logger.error(`Error removing invite channel: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// API: Обновление конфигурации
router.put('/api/invite-channels/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { main_channel_id, prefix } = req.body;

        if (!main_channel_id || !prefix) {
            return res.status(400).json({ error: 'Не указан main_channel_id или prefix' });
        }

        const { updateInviteChannel, inviteChannelExists } = require('../../db/models/inviteChannels');

        // Проверяем, не существует ли уже такая конфигурация (кроме текущей)
        const existing = await inviteChannelExists(main_channel_id, prefix);
        if (existing) {
            // Проверяем, не является ли это той же записью
            const { getAllInviteChannels } = require('../../db/models/inviteChannels');
            const all = await getAllInviteChannels();
            const sameRecord = all.find(ic => ic.id === parseInt(id) && ic.main_channel_id === main_channel_id && ic.prefix === prefix);
            if (!sameRecord) {
                return res.status(400).json({ error: 'Такая конфигурация уже существует' });
            }
        }

        const result = await updateInviteChannel(parseInt(id), main_channel_id, prefix);
        if (result > 0) {
            res.json({ success: true, message: 'Конфигурация обновлена' });
        } else {
            res.status(404).json({ error: 'Конфигурация не найдена' });
        }
    } catch (error) {
        logger.error(`Error updating invite channel: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// API endpoint для получения последнего лог-файла
router.get('/api/latest-log', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');

        const logsDir = path.join(__dirname, '../../logs');

        if (!fs.existsSync(logsDir)) {
            return res.json({
                error: 'Папка logs не найдена',
                logFile: null,
                logContent: null
            });
        }

        // Находим последний файл лога
        const files = fs.readdirSync(logsDir)
            .filter(file => file.endsWith('.log'))
            .map(file => ({
                name: file,
                path: path.join(logsDir, file),
                mtime: fs.statSync(path.join(logsDir, file)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime);

        if (files.length === 0) {
            return res.json({
                error: 'Лог-файлы не найдены',
                logFile: null,
                logContent: null
            });
        }

        const latestLog = files[0];

        // Читаем содержимое файла (ограничиваем размер для производительности)
        const maxSize = 100 * 1024; // 100 KB
        const stats = fs.statSync(latestLog.path);
        let logContent = '';

        if (stats.size > maxSize) {
            // Если файл большой, читаем только последние 100 KB
            const buffer = Buffer.allocUnsafe(maxSize);
            let fd;
            try {
                fd = fs.openSync(latestLog.path, 'r');
                fs.readSync(fd, buffer, 0, maxSize, stats.size - maxSize);
            } finally {
                if (fd !== undefined) {
                    fs.closeSync(fd);
                }
            }
            logContent = buffer.toString('utf8');
            logContent = '... (показаны последние 100 KB из ' + (stats.size / 1024).toFixed(2) + ' KB)\n\n' + logContent;
        } else {
            logContent = fs.readFileSync(latestLog.path, 'utf8');
        }

        // Берем последние 500 строк для отображения
        const lines = logContent.split('\n');
        const lastLines = lines.slice(-500).join('\n');

        res.json({
            logFile: latestLog.name,
            logPath: latestLog.path,
            logSize: stats.size,
            logModified: latestLog.mtime.toISOString(),
            logContent: lastLines,
            totalLines: lines.length,
            showingLastLines: Math.min(500, lines.length)
        });
    } catch (error) {
        logger.error(`Error getting latest log: ${error.message}`);
        res.status(500).json({
            error: 'Не удалось получить лог-файл: ' + error.message,
            logFile: null,
            logContent: null
        });
    }
});

// Страница управления каналами ревью
router.get('/review-channels', async (req, res) => {
    try {
        const { getAllReviewChannels } = require('../../db/models/reviewChannels');
        const { getChannelById } = require('../../mattermost/utils');

        logger.debug('Loading review channels data...');
        const reviewChannels = await getAllReviewChannels();
        logger.debug(`Found ${reviewChannels.length} review channels`);

        // Получаем информацию о каждом канале
        const channelsWithInfo = await Promise.all(
            reviewChannels.map(async (channel) => {
                try {
                    const channelInfo = await getChannelById(channel.channel_id);
                    return {
                        ...channel,
                        name: channelInfo ? (channelInfo.display_name || channelInfo.name || channel.channel_id) : null
                    };
                } catch (error) {
                    logger.warn(`Could not get channel ${channel.channel_id}:`, error);
                    return {
                        ...channel,
                        name: null
                    };
                }
            })
        );

        res.render('adminReviewChannels', {
            error: null,
            channels: channelsWithInfo
        });
    } catch (error) {
        logger.error(`Error in admin review channels: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).render('adminReviewChannels', {
            error: 'Ошибка при загрузке данных',
            channels: []
        });
    }
});

// API: Добавление канала ревью
router.post('/api/review-channels', async (req, res) => {
    try {
        const { channel_id } = req.body;

        if (!channel_id) {
            return res.status(400).json({ error: 'Не указан channel_id' });
        }

        const { addReviewChannel, reviewChannelExists } = require('../../db/models/reviewChannels');

        // Проверяем, не существует ли уже такой канал
        const exists = await reviewChannelExists(channel_id);
        if (exists) {
            return res.status(400).json({ error: 'Такой канал уже добавлен' });
        }

        logger.debug(`Adding review channel: channel_id=${channel_id}`);
        const id = await addReviewChannel(channel_id);
        logger.info(`Review channel added successfully: id=${id}, channel_id=${channel_id}`);

        res.json({ success: true, id, message: 'Канал добавлен' });
    } catch (error) {
        logger.error(`Error adding review channel: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ error: error.message });
    }
});

// API: Удаление канала ревью
router.delete('/api/review-channels/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { removeReviewChannel } = require('../../db/models/reviewChannels');

        const result = await removeReviewChannel(parseInt(id));
        if (result > 0) {
            res.json({ success: true, message: 'Канал удален' });
        } else {
            res.status(404).json({ error: 'Канал не найден' });
        }
    } catch (error) {
        logger.error(`Error removing review channel: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// API endpoint для получения информации о системе
router.get('/api/system-info', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const { getDatabasePath } = require('../../db/config');
        const db = require('../../db/index.js');

        // Получаем информацию о БД (только размер)
        const dbPath = getDatabasePath();
        let dbInfo = {
            size: null
        };

        try {
            // Размер файла БД
            if (fs.existsSync(dbPath)) {
                const stats = fs.statSync(dbPath);
                dbInfo.size = stats.size;
            }
        } catch (dbError) {
            logger.warn(`Could not get database info:`, dbError);
        }

        res.json({
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            database: dbInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error in system-info endpoint: ${error.message}`);
        res.status(500).json({
            error: 'Ошибка при получении системной информации',
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;

