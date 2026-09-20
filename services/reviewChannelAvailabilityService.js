const { getAllReviewChannelIds } = require('../db/models/reviewChannels');
const {
    getExcludedReviewChannelIds,
    setExcludedReviewChannelIds
} = require('../db/models/userReviewChannelSettings');
const { getChannelById, getChannelMember } = require('../mattermost/utils');
const logger = require('../logger');

function isSupportedReviewChannel(channel) {
    if (!channel) return false;
    if (Number(channel.delete_at || 0)) return false;
    return channel.type === 'O' || channel.type === 'P';
}

async function getAvailableReviewChannelsForUser(userId, options = {}) {
    if (!userId) return [];

    const {
        includeExcluded = false,
        includeNames = false
    } = options;

    const reviewChannelIds = await getAllReviewChannelIds();
    const excludedChannelIds = new Set(await getExcludedReviewChannelIds(userId));
    const availableChannels = [];

    for (const channelId of reviewChannelIds) {
        try {
            const membership = await getChannelMember(channelId, userId);
            if (!membership) {
                continue;
            }

            const channel = await getChannelById(channelId);
            if (!isSupportedReviewChannel(channel)) {
                const details = channel
                    ? `type=${channel.type || 'unknown'}, delete_at=${channel.delete_at || 0}, shared=${channel.shared ? 'true' : 'false'}`
                    : 'not found';
                logger.warn(`Review channel ${channelId} is not supported for review posting (${details}); skipping for user ${userId}`);
                continue;
            }

            const isExcluded = excludedChannelIds.has(channelId);
            if (!includeExcluded && isExcluded) {
                continue;
            }

            availableChannels.push({
                id: channelId,
                name: includeNames ? (channel.display_name || channel.name || channelId) : channelId,
                isExcluded
            });
        } catch (error) {
            logger.warn(`Could not resolve review channel ${channelId} for user ${userId}: ${error.message}`);
        }
    }

    return availableChannels;
}

async function getEnabledReviewChannelIdsForUser(userId) {
    const channels = await getAvailableReviewChannelsForUser(userId);
    return channels.map(channel => channel.id);
}

async function saveReviewChannelExclusionsForUser(userId, channelIds) {
    const availableChannels = await getAvailableReviewChannelsForUser(userId, { includeExcluded: true });
    const availableChannelIds = new Set(availableChannels.map(channel => channel.id));
    const allowedExclusions = (Array.isArray(channelIds) ? channelIds : [])
        .map(channelId => String(channelId || '').trim())
        .filter(channelId => availableChannelIds.has(channelId));

    return setExcludedReviewChannelIds(userId, allowedExclusions);
}

module.exports = {
    getAvailableReviewChannelsForUser,
    getEnabledReviewChannelIdsForUser,
    saveReviewChannelExclusionsForUser
};
