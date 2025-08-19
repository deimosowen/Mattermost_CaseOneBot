const { getPost, getUser } = require('../../mattermost/utils');
const reviewCommand = require('../../commands/review');

const inReview = async ({ post_id, task_key, merge_request_url, reviewer }) => {
    try {
        const post = await getPost(post_id);
        const user = await getUser(post.user_id);

        await reviewCommand({ post_id, user_id: user.id, user_name: `@${user.username}`, args: [task_key, merge_request_url, reviewer] });

        return {
            data: 'Задача успешно переведена в статус In Review',
        };
    } catch (error) {
        return {
            data: 'Ошибка при переводе задачи в статус In Review',
        };
    }
}

module.exports = {
    name: 'inReview',
    description: 'Перевод задачи в статус In Review',
    parameters: {
        type: 'object',
        properties: {
            post_id: { type: 'string' },
            task_key: { type: 'string', description: 'Номер задачи в формате "CASEM-XXXXX"' },
            merge_request_url: { type: 'string', description: 'Ссылка на merge request. Если null, то ссылка берется из задачи' },
            reviewer: { type: 'string', description: 'Ревьювер. Имя пользователя, начиная с @' }
        },
    },
    function: inReview,
};