const EventEmitter = require('events');
const logger = require('../logger');

class DomainEventBus extends EventEmitter {
    async emitAsync(eventName, payload = {}) {
        const listeners = this.listeners(eventName);

        await Promise.allSettled(listeners.map(async (listener) => {
            try {
                await listener(payload);
            } catch (error) {
                logger.error(`[DomainEventBus] ${eventName} listener failed: ${error.message}`);
            }
        }));
    }
}

module.exports = new DomainEventBus();
