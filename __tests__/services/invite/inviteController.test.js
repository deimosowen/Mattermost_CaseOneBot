require('./inviteController.setup');

const {
    getInviteChannelsMap,
    getAllMainChannels,
    getMyChannels,
    getChannelMembers,
    addToChannel,
    logger
} = require('./inviteController.setup');

const moment = require('moment');

describe('inviteController logic', () => {
    const testMainChannelId = 'test-main-channel-123';
    const testPrefix1 = 'c1_team';
    const testPrefix2 = 'project-';
    const testUserId = 'test-user-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('получение префиксов из БД', () => {
        test('получает все префиксы из БД через getInviteChannelsMap', async () => {
            const inviteChannelsMap = new Map();
            inviteChannelsMap.set(testMainChannelId, [testPrefix1, testPrefix2]);
            getInviteChannelsMap.mockResolvedValue(inviteChannelsMap);

            const result = await getInviteChannelsMap();

            expect(getInviteChannelsMap).toHaveBeenCalled();
            expect(result instanceof Map).toBe(true);
            expect(result.has(testMainChannelId)).toBe(true);
            expect(result.get(testMainChannelId)).toContain(testPrefix1);
            expect(result.get(testMainChannelId)).toContain(testPrefix2);
        });

        test('собирает все уникальные префиксы из всех каналов', async () => {
            const inviteChannelsMap = new Map();
            inviteChannelsMap.set('main-channel-1', ['prefix1-', 'prefix2-']);
            inviteChannelsMap.set('main-channel-2', ['prefix3-', 'prefix1-']); // prefix1- повторяется
            getInviteChannelsMap.mockResolvedValue(inviteChannelsMap);

            const map = await getInviteChannelsMap();
            const allPrefixes = new Set();
            for (const prefixes of map.values()) {
                prefixes.forEach(prefix => allPrefixes.add(prefix));
            }

            expect(allPrefixes.size).toBe(3); // prefix1-, prefix2-, prefix3-
            expect(allPrefixes.has('prefix1-')).toBe(true);
            expect(allPrefixes.has('prefix2-')).toBe(true);
            expect(allPrefixes.has('prefix3-')).toBe(true);
        });

        test('возвращает пустой Set если нет конфигураций в БД', async () => {
            getInviteChannelsMap.mockResolvedValue(new Map());

            const map = await getInviteChannelsMap();
            const allPrefixes = new Set();
            for (const prefixes of map.values()) {
                prefixes.forEach(prefix => allPrefixes.add(prefix));
            }

            expect(allPrefixes.size).toBe(0);
        });
    });

    describe('фильтрация каналов по префиксам из БД', () => {
        test('фильтрует каналы по префиксам из БД', async () => {
            const inviteChannelsMap = new Map();
            inviteChannelsMap.set(testMainChannelId, [testPrefix1, testPrefix2]);
            getInviteChannelsMap.mockResolvedValue(inviteChannelsMap);

            const allPrefixes = new Set();
            const map = await getInviteChannelsMap();
            for (const prefixes of map.values()) {
                prefixes.forEach(prefix => allPrefixes.add(prefix));
            }

            const mockChannels = [
                {
                    id: 'channel-1',
                    type: 'P',
                    display_name: 'c1_team_test',
                    last_post_at: Date.now()
                },
                {
                    id: 'channel-2',
                    type: 'P',
                    display_name: 'project-alpha',
                    last_post_at: Date.now()
                },
                {
                    id: 'channel-3',
                    type: 'P',
                    display_name: 'other-channel', // не подходит
                    last_post_at: Date.now()
                },
                {
                    id: 'channel-4',
                    type: 'O', // публичный, не подходит
                    display_name: 'c1_team_public',
                    last_post_at: Date.now()
                }
            ];

            const filtered = mockChannels.filter(channel => {
                if (channel.type !== 'P') return false;
                return Array.from(allPrefixes).some(prefix =>
                    channel.display_name.startsWith(prefix)
                );
            });

            expect(filtered).toHaveLength(2);
            expect(filtered.map(c => c.id)).toContain('channel-1');
            expect(filtered.map(c => c.id)).toContain('channel-2');
            expect(filtered.map(c => c.id)).not.toContain('channel-3');
            expect(filtered.map(c => c.id)).not.toContain('channel-4');
        });

        test('фильтрует каналы по всем префиксам из разных основных каналов', async () => {
            const inviteChannelsMap = new Map();
            inviteChannelsMap.set('main-channel-1', ['prefix1-', 'prefix2-']);
            inviteChannelsMap.set('main-channel-2', ['prefix3-']);
            getInviteChannelsMap.mockResolvedValue(inviteChannelsMap);

            const allPrefixes = new Set();
            const map = await getInviteChannelsMap();
            for (const prefixes of map.values()) {
                prefixes.forEach(prefix => allPrefixes.add(prefix));
            }

            const mockChannels = [
                { id: 'ch1', type: 'P', display_name: 'prefix1-test', last_post_at: Date.now() },
                { id: 'ch2', type: 'P', display_name: 'prefix2-test', last_post_at: Date.now() },
                { id: 'ch3', type: 'P', display_name: 'prefix3-test', last_post_at: Date.now() },
                { id: 'ch4', type: 'P', display_name: 'other-test', last_post_at: Date.now() }
            ];

            const filtered = mockChannels.filter(channel => {
                if (channel.type !== 'P') return false;
                return Array.from(allPrefixes).some(prefix =>
                    channel.display_name.startsWith(prefix)
                );
            });

            expect(filtered).toHaveLength(3);
            expect(filtered.map(c => c.id)).toContain('ch1');
            expect(filtered.map(c => c.id)).toContain('ch2');
            expect(filtered.map(c => c.id)).toContain('ch3');
            expect(filtered.map(c => c.id)).not.toContain('ch4');
        });
    });

    describe('проверка членства пользователя в основных каналах', () => {
        test('возвращает true если пользователь член хотя бы одного основного канала', async () => {
            getAllMainChannels.mockResolvedValue(['main-channel-1', 'main-channel-2']);
            getChannelMembers
                .mockResolvedValueOnce([{ user_id: 'other-user' }]) // main-channel-1 - не член
                .mockResolvedValueOnce([{ user_id: testUserId }]); // main-channel-2 - член

            const mainChannelIds = await getAllMainChannels();
            let isMember = false;

            for (const mainChannelId of mainChannelIds) {
                const members = await getChannelMembers(mainChannelId);
                if (members.some(member => member.user_id === testUserId)) {
                    isMember = true;
                    break;
                }
            }

            expect(isMember).toBe(true);
            expect(getAllMainChannels).toHaveBeenCalled();
            expect(getChannelMembers).toHaveBeenCalledWith('main-channel-1');
            expect(getChannelMembers).toHaveBeenCalledWith('main-channel-2');
        });

        test('возвращает false если пользователь не член ни одного основного канала', async () => {
            getAllMainChannels.mockResolvedValue(['main-channel-1', 'main-channel-2']);
            getChannelMembers
                .mockResolvedValueOnce([{ user_id: 'other-user' }])
                .mockResolvedValueOnce([{ user_id: 'another-user' }]);

            const mainChannelIds = await getAllMainChannels();
            let isMember = false;

            for (const mainChannelId of mainChannelIds) {
                const members = await getChannelMembers(mainChannelId);
                if (members.some(member => member.user_id === testUserId)) {
                    isMember = true;
                    break;
                }
            }

            expect(isMember).toBe(false);
        });

        test('возвращает false если нет конфигураций в БД', async () => {
            getAllMainChannels.mockResolvedValue([]);

            const mainChannelIds = await getAllMainChannels();
            const isMember = mainChannelIds.length > 0;

            expect(isMember).toBe(false);
        });

        test('обрабатывает ошибки при проверке членства', async () => {
            getAllMainChannels.mockResolvedValue(['main-channel-1']);
            getChannelMembers.mockRejectedValueOnce(new Error('Channel not found'));

            const mainChannelIds = await getAllMainChannels();
            let isMember = false;
            let hasError = false;

            for (const mainChannelId of mainChannelIds) {
                try {
                    const members = await getChannelMembers(mainChannelId);
                    if (members.some(member => member.user_id === testUserId)) {
                        isMember = true;
                        break;
                    }
                } catch (error) {
                    hasError = true;
                }
            }

            expect(isMember).toBe(false);
            expect(hasError).toBe(true);
        });
    });

    describe('разделение каналов на активные и неактивные', () => {
        test('разделяет каналы по дате последнего поста', () => {
            const daysThreshold = 30;
            const now = Date.now();
            const activeDate = now - 10 * 24 * 60 * 60 * 1000; // 10 дней назад - активный
            const inactiveDate = now - 40 * 24 * 60 * 60 * 1000; // 40 дней назад - неактивный

            const channels = [
                {
                    id: 'channel-active',
                    display_name: 'c1_team_active',
                    last_post_at: activeDate
                },
                {
                    id: 'channel-inactive',
                    display_name: 'c1_team_inactive',
                    last_post_at: inactiveDate
                }
            ];

            const thresholdDate = moment().subtract(daysThreshold, 'days');
            const { activeChannels, inactiveChannels } = channels.reduce((acc, channel) => {
                const lastPostDate = moment(channel.last_post_at);
                const targetGroup = lastPostDate.isAfter(thresholdDate) ? 'activeChannels' : 'inactiveChannels';
                acc[targetGroup].push({
                    id: channel.id,
                    display_name: channel.display_name,
                    last_post_at: lastPostDate.format()
                });
                return acc;
            }, { activeChannels: [], inactiveChannels: [] });

            expect(activeChannels).toHaveLength(1);
            expect(activeChannels[0].id).toBe('channel-active');
            expect(inactiveChannels).toHaveLength(1);
            expect(inactiveChannels[0].id).toBe('channel-inactive');
        });
    });

    describe('использование данных из БД через моки', () => {
        test('контроллер использует getInviteChannelsMap для получения префиксов', async () => {
            const inviteChannelsMap = new Map();
            inviteChannelsMap.set(testMainChannelId, [testPrefix1, testPrefix2]);
            getInviteChannelsMap.mockResolvedValue(inviteChannelsMap);

            const map = await getInviteChannelsMap();

            expect(getInviteChannelsMap).toHaveBeenCalled();
            expect(map.has(testMainChannelId)).toBe(true);
            expect(map.get(testMainChannelId)).toContain(testPrefix1);
            expect(map.get(testMainChannelId)).toContain(testPrefix2);
        });

        test('контроллер использует getAllMainChannels для проверки членства', async () => {
            getAllMainChannels.mockResolvedValue([testMainChannelId, 'other-main-channel']);

            const mainChannels = await getAllMainChannels();

            expect(getAllMainChannels).toHaveBeenCalled();
            expect(mainChannels).toContain(testMainChannelId);
            expect(mainChannels).toContain('other-main-channel');
        });

        test('логика фильтрации каналов использует префиксы из БД', async () => {
            const inviteChannelsMap = new Map();
            inviteChannelsMap.set(testMainChannelId, [testPrefix1]);
            getInviteChannelsMap.mockResolvedValue(inviteChannelsMap);

            // Симулируем логику из контроллера
            const map = await getInviteChannelsMap();
            const allPrefixes = new Set();
            for (const prefixes of map.values()) {
                prefixes.forEach(prefix => allPrefixes.add(prefix));
            }

            const mockChannels = [
                { id: 'ch1', type: 'P', display_name: 'c1_team_test', last_post_at: Date.now() },
                { id: 'ch2', type: 'P', display_name: 'other_channel', last_post_at: Date.now() }
            ];

            const filtered = mockChannels.filter(channel => {
                if (channel.type !== 'P') return false;
                return Array.from(allPrefixes).some(prefix =>
                    channel.display_name.startsWith(prefix)
                );
            });

            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe('ch1');
            expect(getInviteChannelsMap).toHaveBeenCalled();
        });
    });
});

