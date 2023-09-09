const { Client4 } = require('mattermost-redux/client');

const postMessage = async (channel_id, message) => {
    try {
        const post = {
            channel_id,
            message
        };
        await Client4.createPost(post);
    } catch (error) {
        console.error('Error posting message', error);
    }
};

const getUser = async (user_id) => {
    const user = await Client4.getUser(user_id);
    return user;
}

const getPost = async (post_id) => {
    const post = await Client4.getPost(post_id);
    return post;
}

const getChannel = async (team_id, channel_name) => {
    if (!team_id) {
        const team = await getTeam();
        team_id = team.id;
    }
    const channel = await Client4.getChannelByName(team_id, channel_name);
    return channel;
}

const getChannelMembers = async (channel_id) => {
    const members = await Client4.getChannelMembers(channel_id);
    return members;
}

const addToChannel = async (user_id, channel_id) => {
    const result = await Client4.addToChannel(user_id, channel_id);
    return result;
}

const getTeam = async () => {
    const teams = await Client4.getMyTeams();
    return teams[0];
}

module.exports = {
    postMessage,
    getUser,
    getPost,
    getChannel,
    getChannelMembers,
    addToChannel,
};