jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    readFileSync: jest.fn(),
}));

jest.mock('../../config', () => ({
    ADMIN_ID: 'admin-user',
}));

jest.mock('../../mattermost/utils', () => ({
    postMessage: jest.fn(),
    postMessageInTreed: jest.fn(),
    uploadFile: jest.fn(),
    getMe: jest.fn(),
    createDirectChannel: jest.fn(),
}));

jest.mock('../../logger', () => ({
    error: jest.fn(),
    info: jest.fn(),
}));

const fs = require('fs');
const {
    postMessage,
    postMessageInTreed,
    uploadFile,
    getMe,
    createDirectChannel,
} = require('../../mattermost/utils');
const logCommand = require('../../commands/log');

describe('log command', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue(['app.log']);
        fs.statSync.mockReturnValue({ mtime: new Date('2026-01-01T00:00:00.000Z') });
        fs.readFileSync.mockReturnValue(Buffer.from('log content'));

        uploadFile.mockResolvedValue({ file_infos: [{ id: 'file-id' }] });
        getMe.mockResolvedValue({ id: 'bot-user' });
        createDirectChannel.mockResolvedValue({ id: 'direct-channel' });
    });

    test('не отправляет лог пользователю без ADMIN_ID', async () => {
        await logCommand({
            post_id: 'post-id',
            channel_id: 'source-channel',
            user_id: 'regular-user',
            channel_type: 'O',
        });

        expect(uploadFile).not.toHaveBeenCalled();
        expect(postMessage).toHaveBeenCalledWith('source-channel', 'Команда доступна только администратору.');
    });

    test('из публичного канала отправляет файл и сообщение в личный канал', async () => {
        await logCommand({
            post_id: 'source-post',
            channel_id: 'source-channel',
            user_id: 'admin-user',
            channel_type: 'O',
        });

        expect(createDirectChannel).toHaveBeenCalledWith(['admin-user', 'bot-user']);
        expect(uploadFile).toHaveBeenCalledWith(expect.any(Buffer), 'app.log', 'direct-channel');
        expect(postMessage).toHaveBeenCalledWith(
            'direct-channel',
            '📋 Последний файл лога: `app.log`',
            null,
            ['file-id']
        );
        expect(postMessageInTreed).not.toHaveBeenCalledWith('source-post', expect.any(String), expect.any(Array));
    });

    test('в личном канале отвечает в исходный тред', async () => {
        await logCommand({
            post_id: 'direct-post',
            channel_id: 'direct-channel',
            user_id: 'admin-user',
            channel_type: 'D',
        });

        expect(createDirectChannel).not.toHaveBeenCalled();
        expect(uploadFile).toHaveBeenCalledWith(expect.any(Buffer), 'app.log', 'direct-channel');
        expect(postMessageInTreed).toHaveBeenCalledWith(
            'direct-post',
            '📋 Последний файл лога: `app.log`',
            ['file-id']
        );
    });
});
