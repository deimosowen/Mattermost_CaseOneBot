const { _private } = require('../../chatgpt');

describe('Responses function calling helpers', () => {
    test('serializes function calls without persisted response item ids', () => {
        const item = {
            id: 'fc_123',
            type: 'function_call',
            call_id: 'call_123',
            name: 'inviteToChannel',
            arguments: '{"channel_url":"https://mchat.pravo.tech/company/channels/test"}',
            status: 'completed',
        };

        expect(_private.serializeFunctionCallForInput(item)).toEqual({
            type: 'function_call',
            call_id: 'call_123',
            name: 'inviteToChannel',
            arguments: '{"channel_url":"https://mchat.pravo.tech/company/channels/test"}',
        });
    });
});
