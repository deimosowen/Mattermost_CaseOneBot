const { wsClient } = require('./client');
const commands = require('../commands');
const messageEventEmitter = require('../handlers/messageEventEmitter');
const { parseCommand } = require('../commands/parser');

const initializeMattermost = () => {
    wsClient.addMessageListener(function (event) {
        if (event.event === 'posted') {
            const post = JSON.parse(event.data.post);
            if (!post.message.startsWith('!')) {
                messageEventEmitter.emit('nonCommandMessage', post, event.data);
                return;
            }
            const messageParts = parseCommand(post.message);
            const command = messageParts[0];
            const args = messageParts.slice(1);
            if (Object.hasOwnProperty.call(commands, command)) {
                const params = {
                    post_id: post.id,
                    channel_id: post.channel_id,
                    user_id: post.user_id,
                    args: args,
                    user_name: event.data.sender_name,
                    channel_name: event.data.channel_name,
                    channel_type: event.data.channel_type,
                    team_id: event.data.team_id,
                    root_id: post.root_id,
                };
                commands[command](params);
            }
        }
    });
}

module.exports = {
    initializeMattermost
};