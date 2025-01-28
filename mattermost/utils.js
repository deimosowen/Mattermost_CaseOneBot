const moment = require('moment');
const { client, wsClient, authUser } = require('./client');
const fileHelper = require('./fileHelper');
const logger = require('../logger');

class MattermostService {
    constructor() {
        this.client = client;
        this.wsClient = wsClient;
    }

    // File operations
    async downloadFile(fileId) {
        return await fileHelper.downloadFileById(fileId);
    }

    async uploadFile(fileBuffer, fileName, channelId) {
        return await fileHelper.uploadFile(fileBuffer, fileName, channelId);
    }

    // Message operations
    async userTyping(postId) {
        try {
            const { channel_id, root_id } = await this.client.getPost(postId);
            this.wsClient.userTyping(channel_id, root_id);
        } catch (error) {
            this._handleError('userTyping', error);
        }
    }

    async postMessage(channelId, message, rootId = null, fileIds = []) {
        try {
            return await this.client.createPost({
                channel_id: channelId,
                root_id: rootId,
                message,
                file_ids: fileIds
            });
        } catch (error) {
            this._handleError('postMessage', error);
        }
    }

    async postMessageInTreed(postId, message, fileIds = []) {
        try {
            const originalPost = await this.client.getPost(postId);
            return await this.postMessage(
                originalPost.channel_id,
                message,
                originalPost.root_id || originalPost.id,
                fileIds
            );
        } catch (error) {
            this._handleError('postMessageInTreed', error);
        }
    }

    // User operations
    async getMe() {
        return this.client.getMe();
    }

    async getUser(userId) {
        return this.client.getUser(userId);
    }

    async getUserByUsername(username) {
        return this.client.getUserByUsername(username);
    }

    async getProfilePictureUrl(userId) {
        return this.client.getProfilePictureUrl(userId, 0);
    }

    async setStatus(userId, token, text, expiresAt, dndMode) {
        try {
            const userClient = await authUser(token);
            const { props: { customStatus } } = await userClient.getMe();

            const currentStatus = this._parseCustomStatus(customStatus);
            if (this._isValidStatus(currentStatus)) {
                return true;
            }

            await Promise.all([
                dndMode && this._setDndMode(userClient, userId, expiresAt),
                this._setCustomStatus(userClient, text, expiresAt)
            ]);

            return true;
        } catch (error) {
            this._handleError('setStatus', error);
            return false;
        }
    }

    // Channel operations
    async getMyChannels(teamId = null) {
        const resolvedTeamId = teamId || (await this._getDefaultTeam()).id;
        return this.client.getMyChannels(resolvedTeamId, false);
    }

    async getTeam() {
        const team = await this._getDefaultTeam();
        return team;
    }

    async getChannel(teamId = null, channelName) {
        const resolvedTeamId = teamId || (await this._getDefaultTeam()).id;
        return this.client.getChannelByName(resolvedTeamId, channelName);
    }

    async getChannelById(channelId) {
        try {
            return await this.client.getChannel(channelId);
        } catch {
            return null;
        }
    }

    async getChannelMembers(channelId) {
        return this.client.getChannelMembers(channelId);
    }

    async getChannelMember(channelId, userId) {
        try {
            return await this.client.getChannelMember(channelId, userId);
        } catch {
            return null;
        }
    }

    async addToChannel(userId, channelId) {
        return this.client.addToChannel(userId, channelId);
    }

    async createDirectChannel(userIds) {
        return this.client.createDirectChannel(userIds);
    }

    // Post operations
    async getPost(postId) {
        return this.client.getPost(postId);
    }

    async deletePost(postId) {
        return this.client.deletePost(postId);
    }

    async getPostThread(postId) {
        return this.client.getPostThread(postId);
    }

    // Private helper methods
    async _getDefaultTeam() {
        const [team] = await this.client.getMyTeams();
        return team;
    }

    _parseCustomStatus(status) {
        if (typeof status !== 'string') return status;
        try {
            return JSON.parse(status);
        } catch (error) {
            this._handleError('parseCustomStatus', error);
            return null;
        }
    }

    _isValidStatus(status) {
        if (!status?.expires_at) return false;
        return moment.utc(status.expires_at).isAfter(moment().utc());
    }

    async _setDndMode(userClient, userId, expiresAt) {
        const dndEndTime = moment(expiresAt).utc().unix();
        return userClient.updateStatus({
            user_id: userId,
            status: 'dnd',
            manual: true,
            dnd_end_time: dndEndTime
        });
    }

    async _setCustomStatus(userClient, text, expiresAt) {
        return userClient.updateCustomStatus({
            emoji: 'calendar',
            text,
            duration: 'date_and_time',
            expires_at: expiresAt
        });
    }

    _handleError(method, error) {
        logger.error(`Error in ${method}:`, error);
    }
}

// Create singleton instance
const mattermostService = new MattermostService();

// Export instance methods with the same interface as before
module.exports = {
    downloadFile: (...args) => mattermostService.downloadFile(...args),
    uploadFile: (...args) => mattermostService.uploadFile(...args),
    userTyping: (...args) => mattermostService.userTyping(...args),
    postMessage: (...args) => mattermostService.postMessage(...args),
    postMessageInTreed: (...args) => mattermostService.postMessageInTreed(...args),
    getMe: (...args) => mattermostService.getMe(...args),
    getUser: (...args) => mattermostService.getUser(...args),
    getUserByUsername: (...args) => mattermostService.getUserByUsername(...args),
    getProfilePictureUrl: (...args) => mattermostService.getProfilePictureUrl(...args),
    setStatus: (...args) => mattermostService.setStatus(...args),
    getMyChannels: (...args) => mattermostService.getMyChannels(...args),
    getChannel: (...args) => mattermostService.getChannel(...args),
    getChannelById: (...args) => mattermostService.getChannelById(...args),
    getChannelMembers: (...args) => mattermostService.getChannelMembers(...args),
    getChannelMember: (...args) => mattermostService.getChannelMember(...args),
    addToChannel: (...args) => mattermostService.addToChannel(...args),
    createDirectChannel: (...args) => mattermostService.createDirectChannel(...args),
    getPost: (...args) => mattermostService.getPost(...args),
    deletePost: (...args) => mattermostService.deletePost(...args),
    getPostThread: (...args) => mattermostService.getPostThread(...args),
    getTeam: (...args) => mattermostService.getTeam(...args),
};