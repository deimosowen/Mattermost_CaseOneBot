jest.mock('../../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const {
    WorklogReportService,
    getPeriodRange,
    PERIOD_PRESETS,
} = require('../../services/worklogReportService');

describe('worklogReportService', () => {
    test('builds previous week as Monday-Sunday', () => {
        const period = getPeriodRange(PERIOD_PRESETS.previous_week, '2026-06-10T10:00:00Z');

        expect(period.start).toBe('2026-06-01');
        expect(period.end).toBe('2026-06-07');
        expect(period.dates).toEqual([
            '2026-06-01',
            '2026-06-02',
            '2026-06-03',
            '2026-06-04',
            '2026-06-05',
            '2026-06-06',
            '2026-06-07',
        ]);
    });

    test('builds report with working days, absence and summed hours', async () => {
        const mattermost = {
            getAllChannelMembers: jest.fn().mockResolvedValue([
                { user_id: 'user-1' },
                { user_id: 'user-2' },
                { user_id: 'bot-1' },
            ]),
            getUser: jest.fn(async (userId) => ({
                id: userId,
                username: userId === 'user-1' ? 'alice' : userId === 'user-2' ? 'bob' : 'bot',
                email: userId === 'user-1' ? 'alice@example.com' : userId === 'user-2' ? 'bob@example.com' : 'bot@example.com',
                is_bot: userId === 'bot-1',
                delete_at: 0,
            })),
            getChannelById: jest.fn().mockResolvedValue({ display_name: 'Backend' }),
            postMessage: jest.fn(),
        };
        const dayOffService = {
            isHoliday: jest.fn(async (date) => ['2026-06-06', '2026-06-07'].includes(date.format('YYYY-MM-DD'))),
        };
        const absenceService = {
            checkEmployeeAvailabilityByDate: jest.fn().mockResolvedValue({
                'alice@example.com': {
                    '2026-06-01': true,
                    '2026-06-02': true,
                    '2026-06-03': true,
                    '2026-06-04': true,
                    '2026-06-05': true,
                },
                'bob@example.com': {
                    '2026-06-01': true,
                    '2026-06-02': false,
                    '2026-06-03': true,
                    '2026-06-04': true,
                    '2026-06-05': true,
                },
            }),
        };
        const jiraService = {
            fetchWorklogReport: jest.fn().mockResolvedValue({
                hoursByUser: {
                    alice: {
                        '2026-06-01': 3,
                    },
                    bob: {
                        '2026-06-01': 0,
                    },
                },
                source: 'tempo',
                issueCount: 1,
                worklogCount: 2,
            }),
        };
        const service = new WorklogReportService({
            mattermost,
            dayOffService,
            absenceService,
            jiraService,
        });

        const report = await service.buildReport({
            source_channel_id: 'source',
            target_channel_id: 'target',
            period_preset: 'previous_week',
            show_mode: 'all',
            message_template: '{summary}\n{table}',
        }, {
            baseDate: '2026-06-10T10:00:00Z',
        });

        expect(absenceService.checkEmployeeAvailabilityByDate).toHaveBeenCalledWith({
            employeeEmails: ['alice@example.com', 'bob@example.com'],
            dates: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'],
        });
        expect(jiraService.fetchWorklogReport).toHaveBeenCalledWith({
            users: [
                { id: 'user-1', username: 'alice', email: 'alice@example.com' },
                { id: 'user-2', username: 'bob', email: 'bob@example.com' },
            ],
            startDate: '2026-06-01',
            endDate: '2026-06-07',
        });
        expect(report.visibleDates).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
        expect(report.rows.find((row) => row.user.username === 'alice').cells['2026-06-01']).toBe('3ч');
        expect(report.rows.find((row) => row.user.username === 'bob').cells['2026-06-02']).toBe('отпуск');
        expect(report.rows.find((row) => row.user.username === 'bob').cells['2026-06-01']).toBe('0ч');
        expect(report.problemUsers.map((row) => row.user.username)).toEqual(['alice', 'bob']);
        expect(report.table).toContain('| @alice | 3ч | 0ч | 0ч | 0ч | 0ч | 3ч |');
    });

    test('uses Tempo worklog report endpoint', async () => {
        const mattermost = {
            getAllChannelMembers: jest.fn().mockResolvedValue([{ user_id: 'user-1' }]),
            getUser: jest.fn(async () => ({
                id: 'user-1',
                username: 'alice',
                email: 'alice@example.com',
                is_bot: false,
                delete_at: 0,
            })),
            getChannelById: jest.fn().mockResolvedValue({ display_name: 'Backend' }),
            postMessage: jest.fn(),
        };
        const dayOffService = {
            isHoliday: jest.fn(async (date) => ['2026-06-06', '2026-06-07'].includes(date.format('YYYY-MM-DD'))),
        };
        const absenceService = {
            checkEmployeeAvailabilityByDate: jest.fn().mockResolvedValue({
                'alice@example.com': {
                    '2026-06-01': true,
                    '2026-06-02': true,
                    '2026-06-03': true,
                    '2026-06-04': true,
                    '2026-06-05': true,
                },
            }),
        };
        const jiraService = {
            fetchWorklogReport: jest.fn().mockResolvedValue({
                hoursByUser: {
                    alice: {
                        '2026-06-01': 7.5,
                    },
                },
                issueCount: 2,
                worklogCount: 3,
                source: 'tempo',
            }),
            searchTasksByJql: jest.fn(),
            fetchIssueWorklogs: jest.fn(),
        };
        const service = new WorklogReportService({
            mattermost,
            dayOffService,
            absenceService,
            jiraService,
        });

        const report = await service.buildReport({
            source_channel_id: 'source',
            target_channel_id: 'target',
            period_preset: 'previous_week',
            show_mode: 'all',
            message_template: '{table}',
        }, {
            baseDate: '2026-06-10T10:00:00Z',
        });

        expect(jiraService.fetchWorklogReport).toHaveBeenCalledWith({
            users: [{ id: 'user-1', username: 'alice', email: 'alice@example.com' }],
            startDate: '2026-06-01',
            endDate: '2026-06-07',
        });
        expect(jiraService.searchTasksByJql).not.toHaveBeenCalled();
        expect(jiraService.fetchIssueWorklogs).not.toHaveBeenCalled();
        expect(report.rows[0].cells['2026-06-01']).toBe('7ч 30м');
    });

    test('normalizes absence response email casing and false-like values', async () => {
        const mattermost = {
            getAllChannelMembers: jest.fn().mockResolvedValue([{ user_id: 'user-1' }]),
            getUser: jest.fn(async () => ({
                id: 'user-1',
                username: 'alice',
                email: 'Alice@Example.com',
                is_bot: false,
                delete_at: 0,
            })),
            getChannelById: jest.fn().mockResolvedValue({ display_name: 'Backend' }),
            postMessage: jest.fn(),
        };
        const dayOffService = {
            isHoliday: jest.fn(async (date) => ['2026-06-06', '2026-06-07'].includes(date.format('YYYY-MM-DD'))),
        };
        const absenceService = {
            checkEmployeeAvailabilityByDate: jest.fn().mockResolvedValue({
                'alice@example.com': {
                    '2026-06-01T00:00:00.000Z': 'false',
                    '2026-06-02': 0,
                },
            }),
        };
        const jiraService = {
            fetchWorklogReport: jest.fn().mockResolvedValue({
                hoursByUser: { alice: {} },
            }),
        };
        const service = new WorklogReportService({
            mattermost,
            dayOffService,
            absenceService,
            jiraService,
        });

        const report = await service.buildReport({
            source_channel_id: 'source',
            target_channel_id: 'target',
            period_preset: 'previous_week',
            show_mode: 'all',
            message_template: '{table}',
        }, {
            baseDate: '2026-06-10T10:00:00Z',
        });

        expect(report.rows[0].cells['2026-06-01']).toBe('отпуск');
        expect(report.rows[0].cells['2026-06-02']).toBe('отпуск');
    });
});
