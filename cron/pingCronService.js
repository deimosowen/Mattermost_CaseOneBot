const BaseCronService = require('./baseCronService');
const { wsClient } = require('../mattermost/client');
const { postMessage } = require('../mattermost/utils');
const logger = require('../logger');

const WS_PING_CHANNEL_ID = 'dutk7ninhtg7bgwhsht6ijfxpw';
const WS_PING_TIMEOUT_MS = 5000;

class PingCronService extends BaseCronService {
    constructor() {
        super('PingCron');
        this.schedule = '*/1 * * * *';
    }

    async loadJobsFromDb() {
        this.createJob('ws_ping', this.schedule, async () => {
            let pingReceived = false;

            try {
                const timeout = setTimeout(() => {
                    if (!pingReceived) {
                        const msg = '⚠️ WebSocket ping response not received in time.';
                        logger.error(msg);
                        postMessage(WS_PING_CHANNEL_ID, msg);
                    }
                }, WS_PING_TIMEOUT_MS);

                wsClient.getStatuses(() => {
                    pingReceived = true;
                    clearTimeout(timeout);
                });
            } catch (error) {
                const msg = `❌ WebSocket ping failed: ${error.message}`;
                logger.error(`${msg}\nStack trace:\n${error.stack}`);
                postMessage(WS_PING_CHANNEL_ID, msg);
            }
        });
    }
}

module.exports = PingCronService;
