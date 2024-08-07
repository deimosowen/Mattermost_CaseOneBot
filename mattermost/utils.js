const moment = require('moment');
const { client, wsClient, authUser } = require('./client');
const fileHelper = require('./fileHelper');
const logger = require('../logger');

const downloadFile = async (file_id) => {
    const file = await fileHelper.downloadFileById(file_id);
    return file;
}

const uploadFile = async (file_buffer, file_name, channel_id) => {
    const file = await fileHelper.uploadFile(file_buffer, file_name, channel_id);
    return file;
};

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

const postMessage = async (channel_id, message, root_id = null, file_ids = []) => {
    try {
        const post = {
            channel_id,
            root_id,
            message,
            file_ids
        };
        return await client.createPost(post);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};

const postMessageInTreed = async (post_id, message, file_ids = []) => {
    try {
        const originalPost = await client.getPost(post_id);
        const post = {
            channel_id: originalPost.channel_id,
            root_id: originalPost.root_id || originalPost.id,
            message: message,
            file_ids: file_ids
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

const deletePost = async (post_id) => {
    const result = await client.deletePost(post_id);
    return result;
};

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

const getPostThread = async (post_id) => {
    const posts = await client.getPostThread(post_id);
    return posts;
}

const setStatus = async (user_id, token, text, expires_at, dnd_mode) => {
    try {
        const userClient = authUser(token);
        const meInfo = await userClient.getMe();
        const currentStatus = meInfo.props.customStatus
        if (currentStatus && moment(currentStatus.expires_at).isAfter(moment())) {
            return true;
        }
        if (dnd_mode) {
            await userClient.updateStatus({
                user_id: user_id,
                status: 'dnd',
                manual: true,
                dnd_end_time: moment(expires_at).unix()
            });
        }
        await userClient.updateCustomStatus({
            emoji: 'calendar',
            text: text,
            duration: 'date_and_time',
            expires_at: expires_at
        });
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = {
    getMe,
    postMessage,
    postMessageInTreed,
    getUser,
    getUserByUsername,
    getProfilePictureUrl,
    getPost,
    deletePost,
    getChannel,
    getChannelById,
    getChannelMember,
    getChannelMembers,
    getMyChannels,
    getPostThread,
    getTeam,
    addToChannel,
    userTyping,
    downloadFile,
    uploadFile,
    setStatus,
};