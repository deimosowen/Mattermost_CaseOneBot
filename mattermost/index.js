const { wsClient } = require('./client');
const Commands = require('../commands'); // наш автозагрузчик
const messageEventEmitter = require('../handlers/messageEventEmitter');

function extractCommand(message) {
    return message.trim().split(/\s+/, 1)[0].toLowerCase();
}

const eventHandlers = {
    posted: async (event) => {
        const post = JSON.parse(event.data.post);
        const message = post.message || '';

        if (!message.startsWith('!')) {
            messageEventEmitter.emit('nonCommandMessage', post, event.data);
            return;
        }

        const rawCmd = extractCommand(message);
        const entry = Commands.get(rawCmd);
        if (!entry) return;

        const params = {
            post_id: post.id,
            channel_id: post.channel_id,
            user_id: post.user_id,
            user_name: event.data.sender_name,
            channel_name: event.data.channel_name,
            channel_type: event.data.channel_type,
            team_id: event.data.team_id,
            root_id: post.root_id,
            file_ids: post.file_ids,
            rawMessage: message
        };

        await entry.handler(params);
    },

    post_deleted: (event) => {
        const post = JSON.parse(event.data.post);
        messageEventEmitter.emit('postDeleted', post, event.data);
    }
};

const initializeMattermost = () => {
    wsClient.addMessageListener((event) => {
        const handler = eventHandlers[event.event];
        if (handler) handler(event);
    });
};

module.exports = { initializeMattermost };
