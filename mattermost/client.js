const ws = require('ws');

if (!global.WebSocket) {
    global.WebSocket = ws;
}

const { Client4, WebSocketClient } = require('@mattermost/client');
const { API_BASE_URL, BOT_TOKEN } = require('../config');
const { withRetry } = require('./retryHelper');
const logger = require('../logger');

const client = new Client4();
let wsClient = new WebSocketClient();
let eventHandler = null;

const clientCache = new Map();

const MAX_RECONNECT_ATTEMPTS = 10;
const MIN_WEBSOCKET_RETRY_TIME = 3000;
const MAX_WEBSOCKET_RETRY_TIME = 300000;
const JITTER_RANGE = 2000;
let reconnectAttempts = 0;
let reconnectDelay = MIN_WEBSOCKET_RETRY_TIME;

const initializeWebSocket = () => {
    try {
        client.setUrl(`https://${API_BASE_URL}`);
        client.setToken(BOT_TOKEN);

        wsClient.initialize(`wss://${API_BASE_URL}/api/v4/websocket`, BOT_TOKEN);

        wsClient.addErrorListener(onError);
        wsClient.addCloseListener(onClose);

        reconnectAttempts = 0;
        reconnectDelay = MIN_WEBSOCKET_RETRY_TIME;
    } catch (error) {
        logger.error(error);
    }
};

const onError = (event) => {
    logger.error('WebSocket Error:', event);
    handleWebSocketClose();
};

const onClose = (event) => {
    logger.error('WebSocket Closed:', event);
    handleWebSocketClose();
};

const handleWebSocketClose = () => {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts += 1;
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_WEBSOCKET_RETRY_TIME);
        const retryTime = reconnectDelay + Math.random() * JITTER_RANGE;
        setTimeout(() => {
            logger.info(`Reconnecting attempt ${reconnectAttempts}`);

            wsClient.removeErrorListener(onError);
            wsClient.removeCloseListener(onClose);
            wsClient.close();
            wsClient = new WebSocketClient();
            initializeWebSocket();
            initializeMattermostHandlers(eventHandler);
        }, retryTime);
    } else {
        logger.info('Max reconnect attempts reached');
    }
};

initializeWebSocket();

const createClientProxy = (client) => {
    return new Proxy(client, {
        get: (target, propKey) => {
            const originalMethod = target[propKey];
            if (typeof originalMethod === 'function') {
                return withRetry(originalMethod.bind(target), 5, 1500);
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

const initializeMattermostHandlers = (eventHandlers) => {
    if (!eventHandler) {
        eventHandler = eventHandlers;
    }

    wsClient.addMessageListener((event) => {
        const handler = eventHandlers[event.event];
        if (handler) {
            handler(event);
        }
    });
};

module.exports = {
    wsClient,
    client: clientProxy,
    authUser,
    initializeMattermostHandlers,
};
