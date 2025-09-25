if (!global.WebSocket) {
    global.WebSocket = require('ws');
}

const { Client4, WebSocketClient } = require('@mattermost/client');
const { API_BASE_URL, BOT_TOKEN } = require('../config');
const { withRetry } = require('./retryHelper');
const logger = require('../logger');

const client = new Client4();
const wsClient = new WebSocketClient();

const clientCache = new Map();

try {
    client.setUrl(`https://${API_BASE_URL}`);
    client.setToken(BOT_TOKEN);

    wsClient.initialize(`wss://${API_BASE_URL}/api/v4/websocket`, BOT_TOKEN);
} catch (error) {
    logger.error(error);
}

const createClientProxy = (client) => {
    return new Proxy(client, {
        get: (target, propKey) => {
            const originalMethod = target[propKey];
            if (typeof originalMethod === 'function') {
                return withRetry(originalMethod.bind(target), 2, 1500);
            }
            return originalMethod;
        }
    });
};

const clientProxy = createClientProxy(client);

const authUser = async (token) => {
    if (clientCache.has(token)) {
        return clientCache.get(token);
    }

    const userClient = new Client4();
    userClient.setUrl(`https://${API_BASE_URL}`);
    userClient.setToken(token);

    const userClientProxy = createClientProxy(userClient);
    clientCache.set(token, userClientProxy);
    return userClientProxy;
};

module.exports = {
    wsClient,
    client: clientProxy,
    authUser,
};