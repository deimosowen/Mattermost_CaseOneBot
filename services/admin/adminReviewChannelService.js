const {
    getAllReviewChannels,
    addReviewChannel,
    updateReviewChannelSettings,
    removeReviewChannel,
    reviewChannelExists,
} = require('../../db/models/reviewChannels');
const logger = require('../../logger');

async function getReviewChannelsPageData() {
    const { getChannelById } = require('../../mattermost/utils');
    const reviewChannels = await getAllReviewChannels();

    return Promise.all(
        reviewChannels.map(async (channel) => {
            try {
                const channelInfo = await getChannelById(channel.channel_id);
                return {
                    ...channel,
                    name: channelInfo ? (channelInfo.display_name || channelInfo.name || channel.channel_id) : null,
                };
            } catch (error) {
                logger.warn(`Could not get channel ${channel.channel_id}:`, error);
                return {
                    ...channel,
                    name: null,
                };
            }
        })
    );
}

async function createReviewChannel(data) {
    if (!data.channel_id) {
        const error = new Error('Не указан channel_id');
        error.statusCode = 400;
        throw error;
    }

    const exists = await reviewChannelExists(data.channel_id);
    if (exists) {
        const error = new Error('Такой канал уже добавлен');
        error.statusCode = 400;
        throw error;
    }

    return addReviewChannel(data.channel_id);
}

async function deleteReviewChannelConfig(id) {
    const changes = await removeReviewChannel(parseInt(id, 10));
    if (!changes) {
        const error = new Error('Канал не найден');
        error.statusCode = 404;
        throw error;
    }

    return changes;
}

async function updateReviewChannelConfig(id, data) {
    const changes = await updateReviewChannelSettings(parseInt(id, 10), {
        flaky_tests_enabled: data.flaky_tests_enabled,
    });
    if (!changes) {
        const error = new Error('Канал не найден');
        error.statusCode = 404;
        throw error;
    }

    return changes;
}

module.exports = {
    getReviewChannelsPageData,
    createReviewChannel,
    updateReviewChannelConfig,
    deleteReviewChannelConfig,
};
