jest.mock('../../../db/index.js', () => {
    const state = {
        mappings: [],
        processed: [],
        nextMappingId: 1,
        nextProcessedId: 1,
    };

    const dbMock = {
        __reset() {
            state.mappings = [];
            state.processed = [];
            state.nextMappingId = 1;
            state.nextProcessedId = 1;
        },

        get: jest.fn(async (sql, params = []) => {
            if (sql.includes('FROM forward_channel_mapping WHERE source_channel_id = ?')) {
                const [channelId] = params;
                return state.mappings.find(item => item.source_channel_id === channelId) || null;
            }

            if (sql.includes('FROM forward_channel_mapping WHERE id = ?')) {
                const [id] = params;
                return state.mappings.find(item => item.id === Number(id)) || null;
            }

            if (sql.includes('FROM forward_processed_messages WHERE message_id = ?')) {
                const [messageId] = params;
                return state.processed.find(item => item.message_id === messageId) || null;
            }

            return null;
        }),

        all: jest.fn(async (sql) => {
            if (sql.includes('FROM forward_channel_mapping')) {
                return [...state.mappings].sort((a, b) => b.id - a.id);
            }

            if (sql.includes('FROM forward_processed_messages') && sql.includes('GROUP BY channel_id')) {
                const grouped = new Map();
                for (const row of state.processed) {
                    const current = grouped.get(row.channel_id) || {
                        channel_id: row.channel_id,
                        forwarded_count: 0,
                        last_forwarded_at: null,
                    };
                    current.forwarded_count += 1;
                    current.last_forwarded_at = row.timestamp;
                    grouped.set(row.channel_id, current);
                }
                return Array.from(grouped.values());
            }

            return [];
        }),

        run: jest.fn((sql, params = [], callback = () => {}) => {
            if (sql.includes('INSERT INTO forward_channel_mapping')) {
                const [sourceChannelId, targetChannelId, message, threadMessage] = params;
                const id = state.nextMappingId++;
                state.mappings.push({
                    id,
                    source_channel_id: sourceChannelId,
                    target_channel_id: targetChannelId,
                    message,
                    thread_message: threadMessage,
                });
                callback.call({ lastID: id, changes: 1 }, null);
                return;
            }

            if (sql.includes('INSERT INTO forward_processed_messages')) {
                const [channelId, channelName, userId, userName, messageId, sendMessageId] = params;
                const id = state.nextProcessedId++;
                state.processed.push({
                    id,
                    channel_id: channelId,
                    channel_name: channelName,
                    user_id: userId,
                    user_name: userName,
                    message_id: messageId,
                    send_message_id: sendMessageId,
                    timestamp: new Date().toISOString(),
                });
                callback.call({ lastID: id, changes: 1 }, null);
                return;
            }

            callback.call({ lastID: undefined, changes: 0 }, null);
        }),

        runAsync: jest.fn(async (sql, params = []) => {
            if (sql.includes('UPDATE forward_channel_mapping')) {
                const [sourceChannelId, targetChannelId, message, threadMessage, id] = params;
                const row = state.mappings.find(item => item.id === Number(id));
                if (!row) return { changes: 0 };
                row.source_channel_id = sourceChannelId;
                row.target_channel_id = targetChannelId;
                row.message = message;
                row.thread_message = threadMessage;
                return { changes: 1 };
            }

            if (sql.includes('DELETE FROM forward_channel_mapping WHERE id = ?')) {
                const [id] = params;
                const before = state.mappings.length;
                state.mappings = state.mappings.filter(item => item.id !== Number(id));
                return { changes: before - state.mappings.length };
            }

            return { changes: 0 };
        }),
    };

    return dbMock;
});

const db = require('../../../db/index.js');
const {
    addChannelMapping,
    addProcessedMessage,
    deleteChannelMapping,
    getAllChannelMappings,
    getChannelMapping,
    getForwardStatsBySourceChannel,
    isMessageProcessed,
    updateChannelMapping,
} = require('../../../db/models/forward');

describe('forward model', () => {
    beforeEach(() => {
        db.__reset();
        jest.clearAllMocks();
    });

    test('creates, updates and deletes channel mappings', async () => {
        const id = await addChannelMapping('source-a', 'target-a', '{post_link}', 'done');

        expect(id).toBe(1);
        expect(await getChannelMapping(id)).toMatchObject({
            source_channel_id: 'source-a',
            target_channel_id: 'target-a',
        });

        await expect(updateChannelMapping(id, 'source-b', 'target-b', '{message}', null)).resolves.toBe(1);
        expect(await getChannelMapping(id)).toMatchObject({
            source_channel_id: 'source-b',
            target_channel_id: 'target-b',
            message: '{message}',
            thread_message: null,
        });

        await expect(deleteChannelMapping(id)).resolves.toBe(1);
        await expect(getAllChannelMappings()).resolves.toEqual([]);
    });

    test('checks processed messages as a promise and keeps callback compatibility', async () => {
        await expect(isMessageProcessed('post-1')).resolves.toBe(false);

        await addProcessedMessage('source-a', 'Source', 'user-1', 'User', 'post-1', 'sent-1');
        await expect(isMessageProcessed('post-1')).resolves.toBe(true);

        const callback = jest.fn();
        await isMessageProcessed('post-1', callback);
        expect(callback).toHaveBeenCalledWith(null, true);
    });

    test('returns forwarding stats grouped by source channel', async () => {
        await addProcessedMessage('source-a', 'Source A', 'user-1', 'User', 'post-1', 'sent-1');
        await addProcessedMessage('source-a', 'Source A', 'user-2', 'User', 'post-2', 'sent-2');

        await expect(getForwardStatsBySourceChannel()).resolves.toEqual([
            expect.objectContaining({
                channel_id: 'source-a',
                forwarded_count: 2,
            }),
        ]);
    });
});
