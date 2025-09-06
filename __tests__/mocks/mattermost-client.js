jest.mock('@mattermost/client', () => {
    const mockWebSocketClient = {
        initialize: jest.fn(),
        close: jest.fn(),
    };
    const mockClient4 = {
        setUrl: jest.fn(),
        setToken: jest.fn(),
    };

    return {
        Client4: jest.fn(() => mockClient4),
        WebSocketClient: jest.fn(() => mockWebSocketClient)
    };
});
