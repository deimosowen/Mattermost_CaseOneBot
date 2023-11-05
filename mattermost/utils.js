const { client } = require('./client');
const logger = require('../logger');

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

const getUser = async (user_id) => {
    const user = await client.getUser(user_id);
    return user;
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

const getChannelMembers = async (channel_id) => {
    const members = await client.getChannelMembers(channel_id);
    return members;
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
    postMessage,
    getUser,
    getPost,
    getChannel,
    getChannelMembers,
    getTeam,
    addToChannel,
};