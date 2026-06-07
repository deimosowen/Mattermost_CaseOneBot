const db = require('../index.js');
const logger = require('../../logger');

function isTableMissing(error) {
    return /no such table: user_review_channel_exclusions/i.test(error?.message || '');
}

function normalizeChannelIds(channelIds = []) {
    return [...new Set((Array.isArray(channelIds) ? channelIds : [])
        .map(channelId => String(channelId || '').trim())
        .filter(Boolean))];
}

async function getExcludedReviewChannelIds(userId) {
    if (!userId) return [];

    try {
        const rows = await db.all(
            `SELECT channel_id
             FROM user_review_channel_exclusions
             WHERE user_id = ?
             ORDER BY channel_id`,
            [userId]
        );
        return rows.map(row => row.channel_id);
    } catch (error) {
        if (isTableMissing(error)) {
            return [];
        }
        logger.error(`Error getting review channel exclusions for ${userId}: ${error.message}`);
        throw error;
    }
}

async function setExcludedReviewChannelIds(userId, channelIds) {
    if (!userId) {
        throw new Error('userId is required');
    }

    const normalizedChannelIds = normalizeChannelIds(channelIds);

    try {
        await db.transaction(async () => {
            await db.runAsync(
                'DELETE FROM user_review_channel_exclusions WHERE user_id = ?',
                [userId]
            );

            for (const channelId of normalizedChannelIds) {
                await db.runAsync(
                    `INSERT OR IGNORE INTO user_review_channel_exclusions
                     (user_id, channel_id, updated_at)
                     VALUES (?, ?, CURRENT_TIMESTAMP)`,
                    [userId, channelId]
                );
            }
        });
        return normalizedChannelIds;
    } catch (error) {
        logger.error(`Error saving review channel exclusions for ${userId}: ${error.message}`);
        throw error;
    }
}

module.exports = {
    getExcludedReviewChannelIds,
    setExcludedReviewChannelIds
};
