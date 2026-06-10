jest.mock('../../mattermost/utils', () => ({
    postMessage: jest.fn(),
    getTeam: jest.fn(),
}));

jest.mock('../../db/models/forward', () => ({
    getSourceChannelId: jest.fn(),
    addProcessedMessage: jest.fn(),
    isMessageProcessed: jest.fn(),
}));

jest.mock('../../db/models/duty', () => ({
    getCurrentDuty: jest.fn(),
}));

jest.mock('../../services/messageDeliveryService', () => ({
    sendMattermostThread: jest.fn(),
}));

jest.mock('../../logger', () => ({
    error: jest.fn(),
}));

const { postMessage } = require('../../mattermost/utils');
const { getSourceChannelId, addProcessedMessage, isMessageProcessed } = require('../../db/models/forward');
const messageDeliveryService = require('../../services/messageDeliveryService');
const handleMessageForwarding = require('../../handlers/handleMessageForwarding');

describe('handleMessageForwarding', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isMessageProcessed.mockResolvedValue(false);
        postMessage.mockResolvedValue({ id: 'sent-post-id' });
    });

    test('forwards root message immediately and delegates thread reply to delivery rules', async () => {
        getSourceChannelId.mockResolvedValue({
            id: 7,
            source_channel_id: 'source-channel',
            target_channel_id: 'target-channel',
            message: '{message}',
            thread_message: 'Принято',
            thread_message_delivery_mode: 'rules',
        });

        await handleMessageForwarding(
            {
                id: 'post-id',
                channel_id: 'source-channel',
                user_id: 'user-id',
                message: 'Hello',
                root_id: '',
                type: '',
                props: {},
            },
            {
                channel_name: 'Source',
                sender_name: 'User',
            }
        );

        expect(postMessage).toHaveBeenCalledWith('target-channel', 'Hello');
        expect(addProcessedMessage).toHaveBeenCalledWith(
            'source-channel',
            'Source',
            'user-id',
            'User',
            'post-id',
            'sent-post-id'
        );
        expect(messageDeliveryService.sendMattermostThread).toHaveBeenCalledWith({
            postId: 'post-id',
            message: 'Принято',
            deliveryMode: 'rules',
            sourceType: 'forward_thread_message',
            sourceId: '7',
            idempotencyKey: 'forward:7:post-id:thread_message',
        });
    });
});
