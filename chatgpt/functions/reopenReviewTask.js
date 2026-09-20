const { getPost, getUser } = require('../../mattermost/utils');
const reopCommand = require('../../commands/reop');

const reopenReviewTask = async ({ post_id, comment }) => {
    try {
        const post = await getPost(post_id);
        const user = await getUser(post.user_id);

        await reopCommand({
            post_id,
            user_name: `@${user.username}`,
            args: [comment],
        });

        return {
            data: 'Задача отправлена на reop',
        };
    } catch (error) {
        return {
            data: 'Ошибка при reop задачи',
        };
    }
};

module.exports = {
    name: 'reopenReviewTask',
    description: 'Reop задачи на ревью: переводит задачу из In Review обратно в To Do. Задача определяется по первому сообщению текущего треда.',
    parameters: {
        type: 'object',
        properties: {
            post_id: { type: 'string' },
            comment: { type: 'string', description: 'Комментарий в Jira с причиной reop, если пользователь ее указал' },
        },
    },
    function: reopenReviewTask,
};
