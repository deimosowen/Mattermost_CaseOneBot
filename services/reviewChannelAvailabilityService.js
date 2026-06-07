const { getAllReviewChannelIds } = require('../db/models/reviewChannels');
const {
    getExcludedReviewChannelIds,
    setExcludedReviewChannelIds
} = require('../db/models/userReviewChannelSettings');
const { getChannelById, getChannelMember } = require('../mattermost/utils');
const logger = require('../logger');

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

            const isExcluded = excludedChannelIds.has(channelId);
            if (!includeExcluded && isExcluded) {
                continue;
            }

            let channel = null;
            if (includeNames) {
                channel = await getChannelById(channelId);
            }

            availableChannels.push({
                id: channelId,
                name: channel ? (channel.display_name || channel.name || channelId) : channelId,
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
