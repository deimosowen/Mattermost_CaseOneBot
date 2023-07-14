require('babel-polyfill');
require('isomorphic-fetch');

if (!global.WebSocket) {
    global.WebSocket = require('ws');
}

const { Client4 } = require('mattermost-redux/client');
const wsClient = require('mattermost-redux/client/websocket_client').default;
const { API_BASE_URL, BOT_TOKEN } = require('../config');
const commands = require('../commands');

const initializeMattermost = () => {
    Client4.setUrl(`https://${API_BASE_URL}`);
    Client4.setToken(BOT_TOKEN);
    wsClient.initialize(BOT_TOKEN, { connectionUrl: `wss://${API_BASE_URL}/api/v4/websocket` });

    wsClient.setEventCallback(function (event) {
        if (event.event === 'posted') {
            const data = JSON.parse(event.data.post);

            if (!data.message.startsWith('!')) {
                return;
            }
            
            const messageParts = data.message.split(';').map(part => part.trim());
            const command = messageParts[0];
            const args = messageParts.slice(1);
            if (Object.hasOwnProperty.call(commands, command)) {
                const params = {
                    channel_id: data.channel_id,
                    user_id: data.user_id,
                    args: args,
                    user_name: event.data.sender_name,
                    channel_name: event.data.channel_name
                };
                commands[command](params);
            }
        }
    });
}

module.exports = {
    initializeMattermost
};
