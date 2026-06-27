const messageDeliveryService = require('./messageDeliveryService');
const { DELIVERY_MODE, TRANSPORT } = require('./messageDeliveryService');
const { hasTargetChannelReplyInThread } = require('./forwardThreadReplyGuard');
const { getChannelMapping } = require('../db/models/forward');
const logger = require('../logger');

const FORWARD_THREAD_MESSAGE_SOURCE_TYPE = 'forward_thread_message';

async function shouldSkipReply(postId, targetChannelId) {
    if (!targetChannelId) {
        return false;
    }

    const hasReply = await hasTargetChannelReplyInThread(postId, targetChannelId);
    if (hasReply) {
        logger.info(`[ForwardThreadMessage] Skip thread message for ${postId}: target channel user already replied`);
    }

    return hasReply;
}

async function resolveTargetChannelId(payload, sourceId) {
    if (payload?.target_channel_id) {
        return payload.target_channel_id;
    }

    if (!sourceId) {
        return null;
    }

    const mapping = await getChannelMapping(sourceId);
    return mapping?.target_channel_id || null;
}

class ForwardThreadMessageService {
    async sendOrScheduleReply({
        postId,
        message,
        deliveryMode,
        mappingId,
        targetChannelId,
        idempotencyKey,
    }) {
        if (!message) {
            return { status: 'skipped' };
        }

        const shouldSendNow = deliveryMode !== DELIVERY_MODE.RULES;
        const isInsideWindow = !shouldSendNow && await messageDeliveryService.isInsideAllowedWindow();

        if (shouldSendNow || isInsideWindow) {
            if (await shouldSkipReply(postId, targetChannelId)) {
                return { status: 'skipped' };
            }

            return messageDeliveryService.sendMattermostThread({
                postId,
                message,
                deliveryMode: DELIVERY_MODE.IMMEDIATE,
            });
        }

        return messageDeliveryService.schedule({
            transport: TRANSPORT.MATTERMOST_THREAD,
            payload: {
                post_id: postId,
                target_channel_id: targetChannelId,
            },
            message,
            sourceType: FORWARD_THREAD_MESSAGE_SOURCE_TYPE,
            sourceId: String(mappingId),
            idempotencyKey,
        });
    }

    async deliverScheduledReply(scheduledMessage) {
        const payload = JSON.parse(scheduledMessage.payload_json || '{}');
        const postId = payload.post_id;
        const targetChannelId = await resolveTargetChannelId(payload, scheduledMessage.source_id);

        if (await shouldSkipReply(postId, targetChannelId)) {
            return { status: 'skipped' };
        }

        await messageDeliveryService.sendMattermostThread({
            postId,
            message: scheduledMessage.message,
            deliveryMode: DELIVERY_MODE.IMMEDIATE,
        });

        return { status: 'sent' };
    }
}

const defaultService = new ForwardThreadMessageService();

module.exports = defaultService;
module.exports.ForwardThreadMessageService = ForwardThreadMessageService;
module.exports.FORWARD_THREAD_MESSAGE_SOURCE_TYPE = FORWARD_THREAD_MESSAGE_SOURCE_TYPE;
