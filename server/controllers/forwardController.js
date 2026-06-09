const express = require('express');
const {
    addChannelMapping,
    deleteChannelMapping,
    getAllChannelMappings,
    getChannelMapping,
    getForwardStatsBySourceChannel,
    updateChannelMapping
} = require('../../db/models/forward');
const { getChannelById } = require('../../mattermost/utils');
const logger = require('../../logger');

const router = express.Router();

function normalizeText(value) {
    const text = String(value || '').trim();
    return text || null;
}

function normalizeChannelId(value) {
    return String(value || '').trim();
}

function validateMappingPayload(body) {
    const sourceChannelId = normalizeChannelId(body.source_channel_id);
    const targetChannelId = normalizeChannelId(body.target_channel_id);
    const message = normalizeText(body.message);
    const threadMessage = normalizeText(body.thread_message);

    if (!sourceChannelId || !targetChannelId) {
        throw new Error('Укажите исходный и целевой канал');
    }

    if (sourceChannelId === targetChannelId) {
        throw new Error('Исходный и целевой канал должны отличаться');
    }

    return {
        sourceChannelId,
        targetChannelId,
        message,
        threadMessage
    };
}

async function getChannelLabel(channelId) {
    try {
        const channel = await getChannelById(channelId);
        if (!channel) return channelId;
        return channel.display_name || channel.name || channelId;
    } catch (error) {
        logger.warn(`Could not resolve channel ${channelId}: ${error.message}`);
        return channelId;
    }
}

async function enrichMappings(mappings) {
    const statsRows = await getForwardStatsBySourceChannel();
    const statsBySource = new Map(
        statsRows.map((row) => [
            row.channel_id,
            {
                forwarded_count: Number(row.forwarded_count || 0),
                last_forwarded_at: row.last_forwarded_at || null
            }
        ])
    );

    return Promise.all(mappings.map(async (mapping) => {
        const [sourceChannelName, targetChannelName] = await Promise.all([
            getChannelLabel(mapping.source_channel_id),
            getChannelLabel(mapping.target_channel_id)
        ]);
        const stats = statsBySource.get(mapping.source_channel_id) || {
            forwarded_count: 0,
            last_forwarded_at: null
        };

        return {
            ...mapping,
            source_channel_name: sourceChannelName,
            target_channel_name: targetChannelName,
            ...stats
        };
    }));
}

router.get('/', async (_req, res) => {
    try {
        const mappings = await enrichMappings(await getAllChannelMappings());
        res.render('forwardSettings', {
            error: null,
            mappings,
            mappingsJson: JSON.stringify(mappings).replace(/</g, '\\u003c')
        });
    } catch (error) {
        logger.error(`Error in forward settings page: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).render('forwardSettings', {
            error: 'Ошибка при загрузке настроек пересылки',
            mappings: [],
            mappingsJson: '[]'
        });
    }
});

router.post('/api/mappings', async (req, res) => {
    try {
        const payload = validateMappingPayload(req.body);
        const id = await addChannelMapping(
            payload.sourceChannelId,
            payload.targetChannelId,
            payload.message,
            payload.threadMessage
        );

        res.json({ success: true, id, message: 'Пересылка создана' });
    } catch (error) {
        logger.warn(`Could not create forward mapping: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

router.put('/api/mappings/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Некорректный ID пересылки' });
        }

        const existing = await getChannelMapping(id);
        if (!existing) {
            return res.status(404).json({ error: 'Пересылка не найдена' });
        }

        const payload = validateMappingPayload(req.body);
        await updateChannelMapping(
            id,
            payload.sourceChannelId,
            payload.targetChannelId,
            payload.message,
            payload.threadMessage
        );

        res.json({ success: true, message: 'Пересылка обновлена' });
    } catch (error) {
        logger.warn(`Could not update forward mapping: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

router.delete('/api/mappings/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Некорректный ID пересылки' });
        }

        const changes = await deleteChannelMapping(id);
        if (!changes) {
            return res.status(404).json({ error: 'Пересылка не найдена' });
        }

        res.json({ success: true, message: 'Пересылка удалена' });
    } catch (error) {
        logger.error(`Could not delete forward mapping: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
