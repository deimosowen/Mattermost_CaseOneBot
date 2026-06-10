jest.mock('../../mattermost/utils', () => ({
    postMessageInTreed: jest.fn(),
}));

jest.mock('../../db/models/scheduledMessages', () => ({
    addScheduledMessage: jest.fn(),
    getDueScheduledMessages: jest.fn(),
    getPendingScheduledMessageByIdempotencyKey: jest.fn(),
    incrementScheduledMessageAttempt: jest.fn(),
    markScheduledMessageFailed: jest.fn(),
    markScheduledMessageSent: jest.fn(),
    rescheduleScheduledMessage: jest.fn(),
}));

const moment = require('moment');
const { postMessageInTreed } = require('../../mattermost/utils');
const scheduledMessages = require('../../db/models/scheduledMessages');
const {
    DELIVERY_MODE,
    MessageDeliveryService,
    TRANSPORT
} = require('../../services/messageDeliveryService');

describe('MessageDeliveryService', () => {
    const dayOffService = {
        isHoliday: jest.fn(async (date) => {
            const day = moment.utc(date).day();
            return day === 0 || day === 6;
        }),
    };

    let service;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        scheduledMessages.addScheduledMessage.mockResolvedValue(42);
        scheduledMessages.getPendingScheduledMessageByIdempotencyKey.mockResolvedValue(null);
        service = new MessageDeliveryService({
            dayOffService,
            windowStart: '06:00',
            windowEnd: '16:00',
            maxAttempts: 3,
        });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('schedules same workday start before window', async () => {
        const sendAt = await service.getNextAllowedSendAt('2026-06-09T05:30:00Z');

        expect(sendAt.toISOString()).toBe('2026-06-09T06:00:00.000Z');
    });

    test('schedules next workday start after Friday window', async () => {
        const sendAt = await service.getNextAllowedSendAt('2026-06-12T17:30:00Z');

        expect(sendAt.toISOString()).toBe('2026-06-15T06:00:00.000Z');
    });

    test('immediate mode sends message without scheduling', async () => {
        postMessageInTreed.mockResolvedValue({ id: 'reply-id' });

        await expect(service.sendMattermostThread({
            postId: 'post-1',
            message: 'ok',
            deliveryMode: DELIVERY_MODE.IMMEDIATE,
        })).resolves.toEqual({ status: 'sent' });

        expect(postMessageInTreed).toHaveBeenCalledWith('post-1', 'ok');
        expect(scheduledMessages.addScheduledMessage).not.toHaveBeenCalled();
    });

    test('rules mode outside work window stores pending message', async () => {
        jest.setSystemTime(new Date('2026-06-09T17:30:00Z'));

        await expect(service.sendMattermostThread({
            postId: 'post-1',
            message: 'later',
            deliveryMode: DELIVERY_MODE.RULES,
            sourceType: 'forward_thread_message',
            sourceId: '7',
            idempotencyKey: 'forward:7:post-1:thread_message',
        })).resolves.toMatchObject({
            status: 'scheduled',
            id: 42,
            send_after: '2026-06-10T06:00:00.000Z',
        });

        expect(postMessageInTreed).not.toHaveBeenCalled();
        expect(scheduledMessages.addScheduledMessage).toHaveBeenCalledWith(expect.objectContaining({
            transport: TRANSPORT.MATTERMOST_THREAD,
            payload: { post_id: 'post-1' },
            message: 'later',
            max_attempts: 3,
            source_type: 'forward_thread_message',
            source_id: '7',
            idempotency_key: 'forward:7:post-1:thread_message',
        }));
    });

    test('reschedules due rule message if app missed allowed window', async () => {
        jest.setSystemTime(new Date('2026-06-09T18:00:00Z'));

        await service.deliverScheduledMessage({
            id: 9,
            transport: TRANSPORT.MATTERMOST_THREAD,
            payload_json: JSON.stringify({ post_id: 'post-1' }),
            message: 'missed',
            rule_type: 'utc_workday_window',
            attempts: 0,
            max_attempts: 3,
        });

        expect(postMessageInTreed).not.toHaveBeenCalled();
        expect(scheduledMessages.rescheduleScheduledMessage).toHaveBeenCalledWith(
            9,
            '2026-06-10T06:00:00.000Z'
        );
    });
});
