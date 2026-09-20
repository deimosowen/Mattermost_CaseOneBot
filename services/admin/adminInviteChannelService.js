const {
    getAllInviteChannels,
    getAllMainChannels,
    addInviteChannel,
    removeInviteChannel,
    updateInviteChannel,
    inviteChannelExists,
    inviteChannelExistsExceptId,
} = require('../../db/models/inviteChannels');
const logger = require('../../logger');

function assertInviteChannelPayload(data) {
    if (!data.main_channel_id || !data.prefix) {
        const error = new Error('Не указан main_channel_id или prefix');
        error.statusCode = 400;
        throw error;
    }
}

function buildPrefixes(inviteChannels, mainChannelId) {
    return inviteChannels
        .filter((item) => item.main_channel_id === mainChannelId)
        .map((item) => ({ id: item.id, prefix: item.prefix }));
}

async function getInviteChannelsPageData() {
    const { getChannelById } = require('../../mattermost/utils');
    const inviteChannels = await getAllInviteChannels();
    const mainChannelIds = await getAllMainChannels();
    const channels = [];

    for (const mainChannelId of mainChannelIds) {
        const prefixes = buildPrefixes(inviteChannels, mainChannelId);
        try {
            const channel = await getChannelById(mainChannelId);
            channels.push({
                id: mainChannelId,
                name: channel ? (channel.display_name || channel.name || mainChannelId) : mainChannelId,
                prefixes,
            });
        } catch (error) {
            logger.warn(`Could not get channel ${mainChannelId}:`, error);
            channels.push({
                id: mainChannelId,
                name: `Канал ${mainChannelId}`,
                prefixes,
            });
        }
    }

    return channels;
}

async function createInviteChannel(data) {
    assertInviteChannelPayload(data);

    const exists = await inviteChannelExists(data.main_channel_id, data.prefix);
    if (exists) {
        const error = new Error('Такая конфигурация уже существует');
        error.statusCode = 400;
        throw error;
    }

    return addInviteChannel(data.main_channel_id, data.prefix);
}

async function updateInviteChannelConfig(id, data) {
    assertInviteChannelPayload(data);

    const recordId = parseInt(id, 10);
    const exists = await inviteChannelExistsExceptId(data.main_channel_id, data.prefix, recordId);
    if (exists) {
        const error = new Error('Такая конфигурация уже существует');
        error.statusCode = 400;
        throw error;
    }

    const changes = await updateInviteChannel(recordId, data.main_channel_id, data.prefix);
    if (!changes) {
        const error = new Error('Конфигурация не найдена');
        error.statusCode = 404;
        throw error;
    }

    return changes;
}

async function deleteInviteChannelConfig(id) {
    const changes = await removeInviteChannel(parseInt(id, 10));
    if (!changes) {
        const error = new Error('Конфигурация не найдена');
        error.statusCode = 404;
        throw error;
    }

    return changes;
}

module.exports = {
    getInviteChannelsPageData,
    createInviteChannel,
    updateInviteChannelConfig,
    deleteInviteChannelConfig,
};
