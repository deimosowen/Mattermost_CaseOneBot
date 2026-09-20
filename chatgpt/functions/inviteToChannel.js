const inviteService = require('../../services/inviteServices');
const { getPost } = require('../../mattermost/utils');
const { getTaskParent } = require('../../jira');
const { JIRA_BOT_USERNAME, JIRA_BOT_PASSWORD } = require('../../config');

function normalizeMattermostLink(link) {
    const match = String(link || '').match(/https:\/\/mchat\.pravo\.tech[^\s)\]]+/);
    if (!match) {
        return null;
    }
    return match[0].replace(/[^\w/:.-]+$/, '');
}

const inviteToChannel = async ({ post_id, task_key, message_url, channel_url, channel_name }) => {
    try {
        let link;
        const post = await getPost(post_id);
        if (task_key) {
            const authHeader = btoa(`${JIRA_BOT_USERNAME}:${JIRA_BOT_PASSWORD}`);
            const task = await getTaskParent(task_key, `Basic ${authHeader}`);
            link = extractLink(task.comments);
        } else if (channel_url || message_url) {
            link = normalizeMattermostLink(channel_url || message_url);
        } else if (channel_name) {
            link = channel_name;
        }

        if (!link) {
            return {
                data: 'Не нашёл ссылку, сообщение или имя канала для приглашения',
            };
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
    description: 'Пригласить пользователя в канал по номеру задачи, имени канала, ссылке на канал или ссылке на сообщение в канале',
    parameters: {
        type: 'object',
        properties: {
            post_id: { type: 'string' },
            task_key: { type: 'string', description: 'Номер задачи в формате "CASEM-XXXXX"' },
            message_url: { type: 'string', description: 'Ссылка на сообщение в канале или ссылка на канал Mattermost' },
            channel_url: { type: 'string', description: 'Ссылка на канал Mattermost вида https://mchat.pravo.tech/.../channels/...' },
            channel_name: { type: 'string', description: 'Имя канала Mattermost, например c1_fr_autofac' },
        },
    },
    function: inviteToChannel,
};
