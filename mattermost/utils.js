const { client, wsClient } = require('./client');
const logger = require('../logger');

const userTyping = async (post_id) => {
    try {
        const originalPost = await client.getPost(post_id);
        const post = {
            channel_id: originalPost.channel_id,
            root_id: originalPost.root_id
        };
        wsClient.userTyping(post.channel_id, post.root_id);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    };
}

const postMessage = async (channel_id, message, root_id = null) => {
    try {
        const post = {
            channel_id,
            root_id,
            message
        };
        await client.createPost(post);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

const postMessageInTreed = async (post_id, message) => {
    try {
        const originalPost = await client.getPost(post_id);
        const post = {
            channel_id: originalPost.channel_id,
            root_id: originalPost.root_id || originalPost.id,
            message: message
        };
        return await client.createPost(post);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

const getMe = async () => {
    const me = await client.getMe();
    return me;
};

const getUser = async (user_id) => {
    const user = await client.getUser(user_id);
    return user;
}

const getUserByUsername = async (username) => {
    const user = await client.getUserByUsername(username);
    return user;
}

const getMyChannels = async (team_id) => {
    if (!team_id) {
        const team = await getTeam();
        team_id = team.id;
    }
    const channels = await client.getMyChannels(team_id, false);
    return channels;
}

const getProfilePictureUrl = async (user_id) => {
    const url = await client.getProfilePictureUrl(user_id, 0);
    return url;
}

const getPost = async (post_id) => {
    const post = await client.getPost(post_id);
    return post;
}

const getChannel = async (team_id, channel_name) => {
    if (!team_id) {
        const team = await getTeam();
        team_id = team.id;
    }
    const channel = await client.getChannelByName(team_id, channel_name);
    return channel;
}

const getChannelById = async (channel_id) => {
    try {
        const channel = await client.getChannel(channel_id);
        return channel;
    } catch (error) {
        return null;
    }
}

const getChannelMembers = async (channel_id) => {
    const members = await client.getChannelMembers(channel_id);
    return members;
}

const getChannelMember = async (channel_id, user_id) => {
    try {
        const member = await client.getChannelMember(channel_id, user_id);
        return member;
    } catch (error) {
        return null;
    }
}

const addToChannel = async (user_id, channel_id) => {
    const result = await client.addToChannel(user_id, channel_id);
    return result;
}

const getTeam = async () => {
    const teams = await client.getMyTeams();
    return teams[0];
}

module.exports = {
    getMe,
    postMessage,
    postMessageInTreed,
    getUser,
    getUserByUsername,
    getProfilePictureUrl,
    getPost,
    getChannel,
    getChannelById,
    getChannelMember,
    getChannelMembers,
    getMyChannels,
    getTeam,
    addToChannel,
    userTyping,
};