const mattermostUtils = require('../../mattermost/utils');

const getPostThreadMessages = async ({ post_id }) => {
    try {
        const thread = await mattermostUtils.getPostThread(post_id);
        const posts = Object.values(thread.posts).sort((a, b) => a.create_at - b.create_at);

        const userIds = [...new Set(posts.map(post => post.user_id))];
        const users = await Promise.all(userIds.map(id => mattermostUtils.getUser(id)));
        const userMap = {};
        users.forEach(user => {
            userMap[user.id] = user;
        });

        const finalMessage = posts.map(post => {
            const user = userMap[post.user_id];
            return `@${user.username}(${user.first_name} ${user.last_name}) пишет: ${post.message}`;
        }).join('\n');

        return { data: finalMessage };
    }
    catch (error) {
        return {
            data: `При получении сообщений из треда произошла ошибка`
        }
    }
}

module.exports = {
    name: 'getPostThreadMessages',
    description: 'Возвращает все сообщения в треде (обсуждения)',
    parameters: {
        type: 'object',
        properties: {
            post_id: { type: 'string' },
        },
    },
    function: getPostThreadMessages,
};