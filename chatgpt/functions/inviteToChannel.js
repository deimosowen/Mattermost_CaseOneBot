const inviteService = require('../../services/inviteServices');
const { getPost } = require('../../mattermost/utils');
const { getTaskParent } = require('../../jira');
const { JIRA_BOT_USERNAME, JIRA_BOT_PASSWORD } = require('../../config');

const inviteToChannel = async ({ post_id, task_key, message_url }) => {
    try {
        let link;
        const post = await getPost(post_id);
        if (task_key) {
            const authHeader = btoa(`${JIRA_BOT_USERNAME}:${JIRA_BOT_PASSWORD}`);
            const task = await getTaskParent(task_key, `Basic ${authHeader}`);
            link = extractLink(task.comments);
        } else if (message_url) {
            link = message_url;
        }
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
    description: 'Пригласить пользователя в канал по номеру задачи или по ссылке на сообщение в канале',
    parameters: {
        type: 'object',
        properties: {
            post_id: { type: 'string' },
            task_key: { type: 'string', description: 'Номер задачи в формате "CASEM-XXXXX"' },
            message_url: { type: 'string', description: 'Ссылка на сообщение в канале' },
        },
    },
    function: inviteToChannel,
};