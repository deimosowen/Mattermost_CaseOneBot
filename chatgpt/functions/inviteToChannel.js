const inviteService = require('../../services/inviteServices');
const { getPost } = require('../../mattermost/utils');
const { getTask } = require('../../jira');
const { JIRA_BOT_USERNAME, JIRA_BOT_PASSWORD } = require('../../config');

const inviteToChannel = async ({ post_id, task_key }) => {
    try {
        const post = await getPost(post_id);
        const authHeader = btoa(`${JIRA_BOT_USERNAME}:${JIRA_BOT_PASSWORD}`);
        const task = await getTask(task_key, `Basic ${authHeader}`);
        const link = extractLink(task.comments);
        const result = await inviteService.tryAddToChannel(post.user_id, [link]);
        return {
            data: result,
        };
    } catch (error) {
        return {
            data: 'Ошибка при приглашении пользователя в канал',
        };
    }
}

const extractLink = (comments) => {
    const pattern = /https:\/\/mchat\.pravo\.tech[^\s]*/;
    for (const comment of comments) {
        const match = comment.body.match(pattern);
        if (match) {
            let link = match[0];
            link = link.replace(/[^\w\/\:\.]+$/, '');
            return link;
        }
    }
    return null;
};

module.exports = {
    name: 'inviteToChannel',
    description: 'Пригласить пользователя в канал по номеру задачи',
    parameters: {
        type: 'object',
        properties: {
            post_id: { type: 'string' },
            task_key: { type: 'string', description: 'Номер задачи в формате "CASEM-XXXXX"' },
        },
        required: ['task_key'],
    },
    function: inviteToChannel,
};