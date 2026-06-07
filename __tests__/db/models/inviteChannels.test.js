jest.mock('../../../db/index.js', () => {
    const state = {
        rows: [],
        nextId: 1,
    };

    const sortRows = (rows) => [...rows].sort((a, b) => {
        const channelCompare = a.main_channel_id.localeCompare(b.main_channel_id);
        if (channelCompare !== 0) return channelCompare;
        return a.prefix.localeCompare(b.prefix);
    });

    const dbMock = {
        __reset() {
            state.rows = [];
            state.nextId = 1;
        },

        get: jest.fn(async (sql, params = []) => {
            if (sql.includes('SELECT 1 FROM invite_channels')) {
                return { ok: 1 };
            }

            if (sql.includes('SELECT id FROM invite_channels WHERE main_channel_id = ? AND prefix = ?')) {
                const [mainChannelId, prefix] = params;
                const row = state.rows.find(item =>
                    item.main_channel_id === mainChannelId && item.prefix === prefix
                );
                return row ? { id: row.id } : undefined;
            }

            return undefined;
        }),

        all: jest.fn(async (sql, params = []) => {
            if (sql.includes('SELECT * FROM invite_channels WHERE main_channel_id = ?')) {
                const [mainChannelId] = params;
                return sortRows(state.rows.filter(item => item.main_channel_id === mainChannelId));
            }

            if (sql.includes('SELECT * FROM invite_channels ORDER BY main_channel_id, prefix')) {
                return sortRows(state.rows);
            }

            if (sql.includes('SELECT DISTINCT main_channel_id FROM invite_channels')) {
                return [...new Set(state.rows.map(item => item.main_channel_id))]
                    .sort()
                    .map(main_channel_id => ({ main_channel_id }));
            }

            if (sql.includes('SELECT prefix FROM invite_channels WHERE main_channel_id = ?')) {
                const [mainChannelId] = params;
                return state.rows
                    .filter(item => item.main_channel_id === mainChannelId)
                    .sort((a, b) => a.prefix.localeCompare(b.prefix))
                    .map(item => ({ prefix: item.prefix }));
            }

            return [];
        }),

        run: jest.fn((sql, params = [], callback = () => {}) => {
            if (sql.includes('INSERT INTO invite_channels')) {
                const [mainChannelId, prefix] = params;
                const duplicate = state.rows.some(item =>
                    item.main_channel_id === mainChannelId && item.prefix === prefix
                );

                if (duplicate) {
                    const error = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: invite_channels.main_channel_id, invite_channels.prefix');
                    callback.call({ lastID: undefined, changes: 0 }, error);
                    return;
                }

                const id = state.nextId++;
                state.rows.push({
                    id,
                    main_channel_id: mainChannelId,
                    prefix,
                    updated_at: new Date().toISOString(),
                });
                callback.call({ lastID: id, changes: 1 }, null);
                return;
            }

            if (sql.includes('DELETE FROM invite_channels WHERE main_channel_id LIKE ?')) {
                const [pattern] = params;
                const prefix = pattern.replace('%', '');
                const before = state.rows.length;
                state.rows = state.rows.filter(item => !item.main_channel_id.startsWith(prefix));
                callback.call({ changes: before - state.rows.length }, null);
                return;
            }

            if (sql.includes('DELETE FROM invite_channels WHERE id = ?')) {
                const [id] = params;
                const before = state.rows.length;
                state.rows = state.rows.filter(item => item.id !== id);
                callback.call({ changes: before - state.rows.length }, null);
                return;
            }

            if (sql.includes('UPDATE invite_channels')) {
                const [mainChannelId, prefix, id] = params;
                const row = state.rows.find(item => item.id === id);

                if (!row) {
                    callback.call({ changes: 0 }, null);
                    return;
                }

                row.main_channel_id = mainChannelId;
                row.prefix = prefix;
                row.updated_at = new Date().toISOString();
                callback.call({ changes: 1 }, null);
                return;
            }

            callback.call({ changes: 0 }, null);
        }),
    };

    return dbMock;
});

const db = require('../../../db/index.js');
const {
    getAllInviteChannels,
    getInviteChannelsByMainChannel,
    getAllMainChannels,
    addInviteChannel,
    removeInviteChannel,
    updateInviteChannel,
    inviteChannelExists,
    getPrefixesByMainChannel,
    getInviteChannelsMap
} = require('../../../db/models/inviteChannels');

describe('inviteChannels model', () => {
    const testMainChannelId = 'test-channel-123';
    const testPrefix1 = 'team-';
    const testPrefix2 = 'project-';
    const testPrefix3 = 'dev-';

    beforeEach(() => {
        db.__reset();
        jest.clearAllMocks();
    });

    describe('addInviteChannel', () => {
        test('добавляет новую конфигурацию канала и префикса', async () => {
            const id = await addInviteChannel(testMainChannelId, testPrefix1);

            expect(id).toBeGreaterThan(0);

            const all = await getAllInviteChannels();
            const added = all.find(ic => ic.main_channel_id === testMainChannelId && ic.prefix === testPrefix1);
            expect(added).toBeDefined();
            expect(added.id).toBe(id);

            const exists = await inviteChannelExists(testMainChannelId, testPrefix1);
            expect(exists).toBe(true);
        });

        test('добавляет несколько префиксов для одного канала', async () => {
            const id1 = await addInviteChannel(testMainChannelId, testPrefix1);
            const id2 = await addInviteChannel(testMainChannelId, testPrefix2);
            const id3 = await addInviteChannel(testMainChannelId, testPrefix3);

            expect(id1).toBeGreaterThan(0);
            expect(id2).toBeGreaterThan(0);
            expect(id3).toBeGreaterThan(0);
            expect(id1).not.toBe(id2);
            expect(id2).not.toBe(id3);

            const prefixes = await getPrefixesByMainChannel(testMainChannelId);
            expect(prefixes).toHaveLength(3);
            expect(prefixes).toContain(testPrefix1);
            expect(prefixes).toContain(testPrefix2);
            expect(prefixes).toContain(testPrefix3);
        });

        test('не позволяет добавить дубликат (та же пара main_channel_id + prefix)', async () => {
            await addInviteChannel(testMainChannelId, testPrefix1);

            await expect(
                addInviteChannel(testMainChannelId, testPrefix1)
            ).rejects.toThrow('SQLITE_CONSTRAINT');
        });
    });

    describe('getAllInviteChannels', () => {
        test('возвращает все конфигурации', async () => {
            await addInviteChannel(testMainChannelId, testPrefix1);
            await addInviteChannel(testMainChannelId, testPrefix2);
            await addInviteChannel('test-channel-456', testPrefix1);

            const all = await getAllInviteChannels();
            expect(Array.isArray(all)).toBe(true);

            const testChannels = all.filter(ic =>
                ic.main_channel_id === testMainChannelId || ic.main_channel_id === 'test-channel-456'
            );
            expect(testChannels.length).toBeGreaterThanOrEqual(3);
        });

        test('возвращает пустой массив если конфигураций нет', async () => {
            const all = await getAllInviteChannels();
            const testChannels = all.filter(ic => ic.main_channel_id.startsWith('test-'));
            expect(testChannels).toHaveLength(0);
        });
    });

    describe('getInviteChannelsByMainChannel', () => {
        test('возвращает все конфигурации для указанного канала', async () => {
            await addInviteChannel(testMainChannelId, testPrefix1);
            await addInviteChannel(testMainChannelId, testPrefix2);

            const channels = await getInviteChannelsByMainChannel(testMainChannelId);
            expect(channels).toHaveLength(2);
            expect(channels.map(c => c.prefix)).toContain(testPrefix1);
            expect(channels.map(c => c.prefix)).toContain(testPrefix2);
        });

        test('возвращает пустой массив для несуществующего канала', async () => {
            const channels = await getInviteChannelsByMainChannel('non-existent-channel');
            expect(channels).toHaveLength(0);
        });
    });

    describe('getAllMainChannels', () => {
        test('возвращает все уникальные основные каналы', async () => {
            await addInviteChannel(testMainChannelId, testPrefix1);
            await addInviteChannel('test-channel-456', testPrefix1);
            await addInviteChannel('test-channel-456', testPrefix2);

            const mainChannels = await getAllMainChannels();
            expect(mainChannels).toContain(testMainChannelId);
            expect(mainChannels).toContain('test-channel-456');
        });
    });

    describe('getPrefixesByMainChannel', () => {
        test('возвращает массив префиксов для канала', async () => {
            await addInviteChannel(testMainChannelId, testPrefix1);
            await addInviteChannel(testMainChannelId, testPrefix2);

            const prefixes = await getPrefixesByMainChannel(testMainChannelId);
            expect(prefixes).toHaveLength(2);
            expect(prefixes).toContain(testPrefix1);
            expect(prefixes).toContain(testPrefix2);
        });

        test('возвращает пустой массив для канала без префиксов', async () => {
            const prefixes = await getPrefixesByMainChannel('test-channel-without-prefixes');
            expect(prefixes).toHaveLength(0);
        });
    });

    describe('getInviteChannelsMap', () => {
        test('возвращает Map с каналами и их префиксами', async () => {
            await addInviteChannel(testMainChannelId, testPrefix1);
            await addInviteChannel(testMainChannelId, testPrefix2);
            await addInviteChannel('test-channel-456', testPrefix1);

            const map = await getInviteChannelsMap();
            expect(map instanceof Map).toBe(true);
            expect(map.has(testMainChannelId)).toBe(true);
            expect(map.has('test-channel-456')).toBe(true);
            expect(map.get(testMainChannelId)).toHaveLength(2);
            expect(map.get(testMainChannelId)).toContain(testPrefix1);
            expect(map.get(testMainChannelId)).toContain(testPrefix2);
            expect(map.get('test-channel-456')).toHaveLength(1);
            expect(map.get('test-channel-456')).toContain(testPrefix1);
        });
    });

    describe('removeInviteChannel', () => {
        test('удаляет конфигурацию по ID', async () => {
            const id1 = await addInviteChannel(testMainChannelId, testPrefix1);
            await addInviteChannel(testMainChannelId, testPrefix2);

            const result = await removeInviteChannel(id1);
            expect(result).toBe(1);

            const prefixes = await getPrefixesByMainChannel(testMainChannelId);
            expect(prefixes).toHaveLength(1);
            expect(prefixes).toContain(testPrefix2);
            expect(prefixes).not.toContain(testPrefix1);
        });

        test('возвращает 0 если конфигурация не найдена', async () => {
            const result = await removeInviteChannel(99999);
            expect(result).toBe(0);
        });
    });

    describe('updateInviteChannel', () => {
        test('обновляет конфигурацию', async () => {
            const id = await addInviteChannel(testMainChannelId, testPrefix1);

            const existsBefore = await inviteChannelExists(testMainChannelId, testPrefix1);
            expect(existsBefore).toBe(true);

            const newPrefix = 'new-prefix-';

            const result = await updateInviteChannel(id, testMainChannelId, newPrefix);
            expect(result).toBe(1);

            const prefixes = await getPrefixesByMainChannel(testMainChannelId);
            expect(prefixes).toContain(newPrefix);
            expect(prefixes).not.toContain(testPrefix1);
        });

        test('возвращает 0 если конфигурация не найдена', async () => {
            const result = await updateInviteChannel(99999, testMainChannelId, testPrefix1);
            expect(result).toBe(0);
        });
    });

    describe('inviteChannelExists', () => {
        test('возвращает true для существующей конфигурации', async () => {
            await addInviteChannel(testMainChannelId, testPrefix1);

            const exists = await inviteChannelExists(testMainChannelId, testPrefix1);
            expect(exists).toBe(true);
        });

        test('возвращает false для несуществующей конфигурации', async () => {
            const exists = await inviteChannelExists(testMainChannelId, 'non-existent-prefix');
            expect(exists).toBe(false);
        });
    });
});
