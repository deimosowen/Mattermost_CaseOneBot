const moment = require('moment');
const { postMessageInTreed } = require('../mattermost/utils');
const dayOffService = require('./dayOffService');
const config = require('../config');
const logger = require('../logger');
const {
    addScheduledMessage,
    getDueScheduledMessages,
    getPendingScheduledMessageByIdempotencyKey,
    incrementScheduledMessageAttempt,
    markScheduledMessageFailed,
    markScheduledMessageSent,
    rescheduleScheduledMessage
} = require('../db/models/scheduledMessages');

const DELIVERY_MODE = {
    IMMEDIATE: 'immediate',
    RULES: 'rules'
};

const RULE_TYPE = {
    UTC_WORKDAY_WINDOW: 'utc_workday_window'
};

const TRANSPORT = {
    MATTERMOST_THREAD: 'mattermost_thread'
};

function parseUtcTime(value, fallback) {
    const source = String(value || fallback || '').trim();
    const match = source.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) {
        return parseUtcTime(fallback, '06:00');
    }
    return {
        hour: Number(match[1]),
        minute: Number(match[2]),
        value: source
    };
}

function toIsoString(date) {
    return moment.utc(date).toISOString();
}

class MessageDeliveryService {
    constructor(options = {}) {
        this.dayOffService = options.dayOffService || dayOffService;
        this.maxAttempts = options.maxAttempts || config.MESSAGE_DELIVERY_MAX_ATTEMPTS;
        this.windowStart = parseUtcTime(options.windowStart || config.MESSAGE_DELIVERY_WINDOW_START_UTC, '06:00');
        this.windowEnd = parseUtcTime(options.windowEnd || config.MESSAGE_DELIVERY_WINDOW_END_UTC, '16:00');
    }

    getWindowForDate(date) {
        const start = moment.utc(date).startOf('day').hour(this.windowStart.hour).minute(this.windowStart.minute);
        const end = moment.utc(date).startOf('day').hour(this.windowEnd.hour).minute(this.windowEnd.minute);
        if (!end.isAfter(start)) {
            end.add(1, 'day');
        }
        return { start, end };
    }

    async isInsideAllowedWindow(date = new Date()) {
        const now = moment.utc(date);
        if (await this.dayOffService.isHoliday(now)) {
            return false;
        }

        const { start, end } = this.getWindowForDate(now);
        return now.isSameOrAfter(start) && now.isBefore(end);
    }

    async getNextAllowedSendAt(date = new Date()) {
        const now = moment.utc(date);
        const { start, end } = this.getWindowForDate(now);
        const isHoliday = await this.dayOffService.isHoliday(now);

        if (!isHoliday && now.isBefore(start)) {
            return start;
        }

        if (!isHoliday && now.isSameOrAfter(start) && now.isBefore(end)) {
            return now;
        }

        let candidate = now.clone().add(1, 'day').startOf('day');
        while (await this.dayOffService.isHoliday(candidate)) {
            candidate.add(1, 'day');
        }

        return this.getWindowForDate(candidate).start;
    }

    async sendOrSchedule({ transport, payload, message, deliveryMode = DELIVERY_MODE.IMMEDIATE, sourceType = null, sourceId = null, idempotencyKey = null }) {
        if (!message) {
            return { status: 'skipped' };
        }

        if (deliveryMode !== DELIVERY_MODE.RULES || await this.isInsideAllowedWindow()) {
            await this.sendNow({ transport, payload, message });
            return { status: 'sent' };
        }

        const sendAfter = await this.getNextAllowedSendAt();
        if (idempotencyKey) {
            const existing = await getPendingScheduledMessageByIdempotencyKey(idempotencyKey);
            if (existing) {
                return { status: 'already_scheduled', id: existing.id, send_after: existing.send_after };
            }
        }

        const id = await addScheduledMessage({
            transport,
            payload,
            message,
            rule_type: RULE_TYPE.UTC_WORKDAY_WINDOW,
            send_after: toIsoString(sendAfter),
            max_attempts: this.maxAttempts,
            source_type: sourceType,
            source_id: sourceId,
            idempotency_key: idempotencyKey
        });

        return { status: 'scheduled', id, send_after: toIsoString(sendAfter) };
    }

    async sendMattermostThread({ postId, message, deliveryMode = DELIVERY_MODE.IMMEDIATE, sourceType = null, sourceId = null, idempotencyKey = null }) {
        return this.sendOrSchedule({
            transport: TRANSPORT.MATTERMOST_THREAD,
            payload: { post_id: postId },
            message,
            deliveryMode,
            sourceType,
            sourceId,
            idempotencyKey
        });
    }

    async processDueMessages(limit = 20) {
        const messages = await getDueScheduledMessages(limit);
        let processed = 0;

        for (const scheduledMessage of messages) {
            try {
                await this.deliverScheduledMessage(scheduledMessage);
                processed += 1;
            } catch (error) {
                logger.error(`[MessageDelivery] Failed to process scheduled message ${scheduledMessage.id}: ${error.message}`);
            }
        }

        return processed;
    }

    async deliverScheduledMessage(scheduledMessage) {
        try {
            if (scheduledMessage.rule_type === RULE_TYPE.UTC_WORKDAY_WINDOW && !(await this.isInsideAllowedWindow())) {
                const nextSendAt = await this.getNextAllowedSendAt();
                await rescheduleScheduledMessage(scheduledMessage.id, toIsoString(nextSendAt));
                return;
            }

            await this.sendNow({
                transport: scheduledMessage.transport,
                payload: JSON.parse(scheduledMessage.payload_json || '{}'),
                message: scheduledMessage.message
            });
            await markScheduledMessageSent(scheduledMessage.id);
        } catch (error) {
            const attempts = Number(scheduledMessage.attempts || 0) + 1;
            const maxAttempts = Number(scheduledMessage.max_attempts || this.maxAttempts);
            const errorMessage = error.message || String(error);

            if (attempts >= maxAttempts) {
                await markScheduledMessageFailed(scheduledMessage.id, errorMessage);
                return;
            }

            await incrementScheduledMessageAttempt(scheduledMessage.id, errorMessage);
        }
    }

    async sendNow({ transport, payload, message }) {
        switch (transport) {
            case TRANSPORT.MATTERMOST_THREAD:
                if (!payload?.post_id) {
                    throw new Error('post_id is required for mattermost_thread delivery');
                }
                return postMessageInTreed(payload.post_id, message);
            default:
                throw new Error(`Unsupported delivery transport: ${transport}`);
        }
    }
}

const defaultService = new MessageDeliveryService();

module.exports = defaultService;
module.exports.MessageDeliveryService = MessageDeliveryService;
module.exports.DELIVERY_MODE = DELIVERY_MODE;
module.exports.RULE_TYPE = RULE_TYPE;
module.exports.TRANSPORT = TRANSPORT;
