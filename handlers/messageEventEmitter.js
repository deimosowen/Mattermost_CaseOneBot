const EventEmitter = require('events');
const messageHandlers = require('./messageHandlers');

class MessageEventEmitter extends EventEmitter { }

const messageEventEmitter = new MessageEventEmitter();

messageEventEmitter.on('nonCommandMessage', (post, eventData) => {
    messageHandlers.handleMessageForwarding(post, eventData);
    messageHandlers.handleQuestion(post, eventData);
});

module.exports = messageEventEmitter;