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

module.exports = {
    postMessage,
    getUser,
};