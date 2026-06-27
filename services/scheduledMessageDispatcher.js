const messageDeliveryService = require('./messageDeliveryService');
const forwardThreadMessageService = require('./forwardThreadMessageService');
const logger = require('../logger');
const {
    getDueScheduledMessages,
    incrementScheduledMessageAttempt,
    markScheduledMessageFailed,
    markScheduledMessageSent,
    rescheduleScheduledMessage,
} = require('../db/models/scheduledMessages');

async function handleDeliveryFailure(scheduledMessage, error) {
    const attempts = Number(scheduledMessage.attempts || 0) + 1;
    const maxAttempts = Number(scheduledMessage.max_attempts || messageDeliveryService.maxAttempts);
    const errorMessage = error.message || String(error);

    if (attempts >= maxAttempts) {
        await markScheduledMessageFailed(scheduledMessage.id, errorMessage);
        return;
    }

    await incrementScheduledMessageAttempt(scheduledMessage.id, errorMessage);
}

class ScheduledMessageDispatcher {
    async processDueMessages(limit = 20) {
        const messages = await getDueScheduledMessages(limit);
        let processed = 0;

        for (const scheduledMessage of messages) {
            try {
                await this.deliverScheduledMessage(scheduledMessage);
                processed += 1;
            } catch (error) {
                logger.error(`[ScheduledMessageDispatcher] Failed to process scheduled message ${scheduledMessage.id}: ${error.message}`);
            }
        }

        return processed;
    }

    async deliverScheduledMessage(scheduledMessage) {
        if (scheduledMessage.rule_type === messageDeliveryService.RULE_TYPE.UTC_WORKDAY_WINDOW
            && !(await messageDeliveryService.isInsideAllowedWindow())) {
            const nextSendAt = await messageDeliveryService.getNextAllowedSendAt();
            await rescheduleScheduledMessage(
                scheduledMessage.id,
                messageDeliveryService.toUtcDateTimeString(nextSendAt)
            );
            return;
        }

        if (scheduledMessage.source_type === forwardThreadMessageService.FORWARD_THREAD_MESSAGE_SOURCE_TYPE) {
            await this.deliverForwardThreadMessage(scheduledMessage);
            return;
        }

        await messageDeliveryService.deliverScheduledMessage(scheduledMessage);
    }

    async deliverForwardThreadMessage(scheduledMessage) {
        try {
            await forwardThreadMessageService.deliverScheduledReply(scheduledMessage);
            await markScheduledMessageSent(scheduledMessage.id);
        } catch (error) {
            await handleDeliveryFailure(scheduledMessage, error);
        }
    }
}

module.exports = new ScheduledMessageDispatcher();
module.exports.ScheduledMessageDispatcher = ScheduledMessageDispatcher;
