const { getPost, getUser } = require('../../mattermost/utils');
const reviewCommand = require('../../commands/review');

function normalizeReviewer(reviewer) {
    if (!reviewer || typeof reviewer !== 'string') {
        return null;
    }

    const normalized = reviewer.trim();
    return normalized.startsWith('@') ? normalized : `@${normalized}`;
}

const changeReviewReviewer = async ({ post_id, reviewer }) => {
    const normalizedReviewer = normalizeReviewer(reviewer);

    if (!normalizedReviewer) {
        return {
            data: 'Не указан новый ревьюер',
        };
    }

    try {
        const post = await getPost(post_id);
        const user = await getUser(post.user_id);

        await reviewCommand({
            post_id,
            user_id: user.id,
            user_name: `@${user.username}`,
            args: [null, null, normalizedReviewer],
        });

        return {
            data: `Ревьюер изменен на ${normalizedReviewer}`,
        };
    } catch (error) {
        return {
            data: 'Ошибка при смене ревьюера',
        };
    }
};

module.exports = {
    name: 'changeReviewReviewer',
    description: 'Смена ревьюера задачи на ревью. Задача определяется по первому сообщению текущего треда.',
    parameters: {
        type: 'object',
        properties: {
            post_id: { type: 'string' },
            reviewer: { type: 'string', description: 'Новый ревьюер. Имя пользователя, начиная с @' },
        },
        required: ['reviewer'],
    },
    function: changeReviewReviewer,
};
