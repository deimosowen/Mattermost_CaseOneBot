jest.mock('../../services/messageDeliveryService', () => ({
    DELIVERY_MODE: {
        IMMEDIATE: 'immediate',
        RULES: 'rules',
    },
    TRANSPORT: {
        MATTERMOST_THREAD: 'mattermost_thread',
    },
    isInsideAllowedWindow: jest.fn(),
    sendMattermostThread: jest.fn(),
    schedule: jest.fn(),
}));

jest.mock('../../services/forwardThreadReplyGuard', () => ({
    hasTargetChannelReplyInThread: jest.fn(),
}));

jest.mock('../../db/models/forward', () => ({
    getChannelMapping: jest.fn(),
}));

jest.mock('../../logger', () => ({
    info: jest.fn(),
}));

const messageDeliveryService = require('../../services/messageDeliveryService');
const { hasTargetChannelReplyInThread } = require('../../services/forwardThreadReplyGuard');
const { getChannelMapping } = require('../../db/models/forward');
const forwardThreadMessageService = require('../../services/forwardThreadMessageService');

describe('ForwardThreadMessageService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        messageDeliveryService.isInsideAllowedWindow.mockResolvedValue(false);
        messageDeliveryService.sendMattermostThread.mockResolvedValue({ status: 'sent' });
        messageDeliveryService.schedule.mockResolvedValue({ status: 'scheduled', id: 42 });
        hasTargetChannelReplyInThread.mockResolvedValue(false);
        getChannelMapping.mockResolvedValue({ target_channel_id: 'target-channel' });
    });

    test('immediate reply checks thread guard before sending', async () => {
        await expect(forwardThreadMessageService.sendOrScheduleReply({
            postId: 'post-1',
            message: 'Принято',
            deliveryMode: 'immediate',
            mappingId: 7,
            targetChannelId: 'target-channel',
            idempotencyKey: 'forward:7:post-1:thread_message',
        })).resolves.toEqual({ status: 'sent' });

        expect(hasTargetChannelReplyInThread).toHaveBeenCalledWith('post-1', 'target-channel');
        expect(messageDeliveryService.sendMattermostThread).toHaveBeenCalledWith({
            postId: 'post-1',
            message: 'Принято',
            deliveryMode: 'immediate',
        });
    });

    test('immediate reply is skipped if target channel user already replied', async () => {
        hasTargetChannelReplyInThread.mockResolvedValue(true);

        await expect(forwardThreadMessageService.sendOrScheduleReply({
            postId: 'post-1',
            message: 'Принято',
            deliveryMode: 'immediate',
            mappingId: 7,
            targetChannelId: 'target-channel',
            idempotencyKey: 'forward:7:post-1:thread_message',
        })).resolves.toEqual({ status: 'skipped' });

        expect(messageDeliveryService.sendMattermostThread).not.toHaveBeenCalled();
    });

    test('rules reply outside work window is scheduled with forwarding payload', async () => {
        await expect(forwardThreadMessageService.sendOrScheduleReply({
            postId: 'post-1',
            message: 'Принято',
            deliveryMode: 'rules',
            mappingId: 7,
            targetChannelId: 'target-channel',
            idempotencyKey: 'forward:7:post-1:thread_message',
        })).resolves.toEqual({ status: 'scheduled', id: 42 });

        expect(messageDeliveryService.schedule).toHaveBeenCalledWith({
            transport: 'mattermost_thread',
            payload: {
                post_id: 'post-1',
                target_channel_id: 'target-channel',
            },
            message: 'Принято',
            sourceType: 'forward_thread_message',
            sourceId: '7',
            idempotencyKey: 'forward:7:post-1:thread_message',
        });
    });

    test('scheduled reply resolves target channel from mapping for old payloads', async () => {
        await expect(forwardThreadMessageService.deliverScheduledReply({
            id: 10,
            source_id: '7',
            payload_json: JSON.stringify({ post_id: 'post-1' }),
            message: 'Принято',
        })).resolves.toEqual({ status: 'sent' });

        expect(getChannelMapping).toHaveBeenCalledWith('7');
        expect(hasTargetChannelReplyInThread).toHaveBeenCalledWith('post-1', 'target-channel');
        expect(messageDeliveryService.sendMattermostThread).toHaveBeenCalledWith({
            postId: 'post-1',
            message: 'Принято',
            deliveryMode: 'immediate',
        });
    });

    test('scheduled reply is skipped if target channel user replied before delivery', async () => {
        hasTargetChannelReplyInThread.mockResolvedValue(true);

        await expect(forwardThreadMessageService.deliverScheduledReply({
            id: 10,
            source_id: '7',
            payload_json: JSON.stringify({
                post_id: 'post-1',
                target_channel_id: 'target-channel',
            }),
            message: 'Принято',
        })).resolves.toEqual({ status: 'skipped' });

        expect(messageDeliveryService.sendMattermostThread).not.toHaveBeenCalled();
    });
});
