require('babel-polyfill');
require('isomorphic-fetch');

if (!global.WebSocket) {
    global.WebSocket = require('ws');
}

const { Client4, WebSocketClient } = require('@mattermost/client');
const { API_BASE_URL, BOT_TOKEN } = require('../config');

const client = new Client4();
client.setUrl(`https://${API_BASE_URL}`);
client.setToken(BOT_TOKEN);

const wsClient = new WebSocketClient();
wsClient.initialize(`wss://${API_BASE_URL}/api/v4/websocket`, BOT_TOKEN);

module.exports = {
    wsClient,
    client
};