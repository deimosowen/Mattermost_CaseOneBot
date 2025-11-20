// Централизованные моки для inviteController
jest.mock('../../../db/models/inviteChannels');
jest.mock('../../../mattermost/utils');
jest.mock('../../../logger', () => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
}));

// Импорт после jest.mock(...)
const {
    getInviteChannelsMap,
    getAllMainChannels
} = require('../../../db/models/inviteChannels');

const {
    getMyChannels,
    getChannelMembers,
    addToChannel
} = require('../../../mattermost/utils');

const logger = require('../../../logger');

module.exports = {
    getInviteChannelsMap,
    getAllMainChannels,
    getMyChannels,
    getChannelMembers,
    addToChannel,
    logger
};

