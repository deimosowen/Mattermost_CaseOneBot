jest.mock('../../services/messageDeliveryService', () => ({
    RULE_TYPE: {
        UTC_WORKDAY_WINDOW: 'utc_workday_window',
    },
    maxAttempts: 3,
    isInsideAllowedWindow: jest.fn(),
    getNextAllowedSendAt: jest.fn(),
    toUtcDateTimeString: jest.fn(),
    deliverScheduledMessage: jest.fn(),
}));

jest.mock('../../services/forwardThreadMessageService', () => ({
    FORWARD_THREAD_MESSAGE_SOURCE_TYPE: 'forward_thread_message',
    deliverScheduledReply: jest.fn(),
}));

jest.mock('../../db/models/scheduledMessages', () => ({
    getDueScheduledMessages: jest.fn(),
    incrementScheduledMessageAttempt: jest.fn(),
    markScheduledMessageFailed: jest.fn(),
    markScheduledMessageSent: jest.fn(),
    rescheduleScheduledMessage: jest.fn(),
}));

jest.mock('../../logger', () => ({
    error: jest.fn(),
}));

const messageDeliveryService = require('../../services/messageDeliveryService');
const forwardThreadMessageService = require('../../services/forwardThreadMessageService');
const scheduledMessages = require('../../db/models/scheduledMessages');
const scheduledMessageDispatcher = require('../../services/scheduledMessageDispatcher');

describe('ScheduledMessageDispatcher', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        messageDeliveryService.isInsideAllowedWindow.mockResolvedValue(true);
        messageDeliveryService.getNextAllowedSendAt.mockResolvedValue(new Date('2026-06-10T06:00:00Z'));
        messageDeliveryService.toUtcDateTimeString.mockReturnValue('2026-06-10 06:00:00');
        messageDeliveryService.deliverScheduledMessage.mockResolvedValue(undefined);
        forwardThreadMessageService.deliverScheduledReply.mockResolvedValue({ status: 'sent' });
        scheduledMessages.getDueScheduledMessages.mockResolvedValue([]);
    });

    test('processes generic scheduled messages via message delivery service', async () => {
        const message = {
            id: 1,
            source_type: null,
            rule_type: 'utc_workday_window',
        };
        scheduledMessages.getDueScheduledMessages.mockResolvedValue([message]);

        await expect(scheduledMessageDispatcher.processDueMessages()).resolves.toBe(1);

        expect(messageDeliveryService.deliverScheduledMessage).toHaveBeenCalledWith(message);
        expect(forwardThreadMessageService.deliverScheduledReply).not.toHaveBeenCalled();
    });

    test('processes forward thread messages via forwarding service and marks sent', async () => {
        const message = {
            id: 2,
            source_type: 'forward_thread_message',
            rule_type: 'utc_workday_window',
        };

        await scheduledMessageDispatcher.deliverScheduledMessage(message);

        expect(forwardThreadMessageService.deliverScheduledReply).toHaveBeenCalledWith(message);
        expect(scheduledMessages.markScheduledMessageSent).toHaveBeenCalledWith(2);
        expect(messageDeliveryService.deliverScheduledMessage).not.toHaveBeenCalled();
    });

    test('reschedules message if allowed window was missed', async () => {
        messageDeliveryService.isInsideAllowedWindow.mockResolvedValue(false);
        const message = {
            id: 3,
            source_type: 'forward_thread_message',
            rule_type: 'utc_workday_window',
        };

        await scheduledMessageDispatcher.deliverScheduledMessage(message);

        expect(scheduledMessages.rescheduleScheduledMessage).toHaveBeenCalledWith(3, '2026-06-10 06:00:00');
        expect(forwardThreadMessageService.deliverScheduledReply).not.toHaveBeenCalled();
    });

    test('increments attempt on forward delivery failure', async () => {
        forwardThreadMessageService.deliverScheduledReply.mockRejectedValue(new Error('boom'));
        const message = {
            id: 4,
            source_type: 'forward_thread_message',
            rule_type: 'utc_workday_window',
            attempts: 0,
            max_attempts: 3,
        };

        await scheduledMessageDispatcher.deliverScheduledMessage(message);

        expect(scheduledMessages.incrementScheduledMessageAttempt).toHaveBeenCalledWith(4, 'boom');
        expect(scheduledMessages.markScheduledMessageSent).not.toHaveBeenCalled();
    });
});
