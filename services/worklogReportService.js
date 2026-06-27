const moment = require('moment');
const { getAllChannelMembers, getUser, getChannelById, postMessage } = require('../mattermost/utils');
const absenceService = require('./absenceService');
const dayOffService = require('./dayOffService');
const JiraService = require('./jiraService');
const logger = require('../logger');

const PERIOD_PRESETS = {
    previous_week: 'previous_week',
    current_week: 'current_week',
    previous_month: 'previous_month',
    current_month: 'current_month',
};

const SHOW_MODES = {
    all: 'all',
    problems: 'problems',
};

const PERIOD_LABELS = {
    [PERIOD_PRESETS.previous_week]: 'Прошлая неделя',
    [PERIOD_PRESETS.current_week]: 'Текущая неделя',
    [PERIOD_PRESETS.previous_month]: 'Прошлый месяц',
    [PERIOD_PRESETS.current_month]: 'Текущий месяц',
};

const WEEKDAY_LABELS = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

function normalizePreset(preset) {
    return Object.values(PERIOD_PRESETS).includes(preset) ? preset : PERIOD_PRESETS.previous_week;
}

function normalizeShowMode(mode) {
    return Object.values(SHOW_MODES).includes(mode) ? mode : SHOW_MODES.problems;
}

function getDisplayName(user) {
    return user.nickname || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.id;
}

function getPeriodRange(periodPreset, baseDate = moment.utc()) {
    const preset = normalizePreset(periodPreset);
    const base = moment.utc(baseDate).startOf('day');
    let start;
    let end;

    if (preset === PERIOD_PRESETS.previous_week) {
        start = base.clone().subtract(1, 'week').isoWeekday(1);
        end = start.clone().add(6, 'days');
    } else if (preset === PERIOD_PRESETS.current_week) {
        start = base.clone().isoWeekday(1);
        end = moment.min(start.clone().add(6, 'days'), base);
    } else if (preset === PERIOD_PRESETS.previous_month) {
        start = base.clone().subtract(1, 'month').startOf('month');
        end = start.clone().endOf('month').startOf('day');
    } else {
        start = base.clone().startOf('month');
        end = moment.min(base.clone().endOf('month').startOf('day'), base);
    }

    const dates = [];
    const cursor = start.clone();
    while (cursor.isSameOrBefore(end, 'day')) {
        dates.push(cursor.format('YYYY-MM-DD'));
        cursor.add(1, 'day');
    }

    return {
        preset,
        start: start.format('YYYY-MM-DD'),
        end: end.format('YYYY-MM-DD'),
        dates,
        label: `${PERIOD_LABELS[preset]} (${start.format('DD.MM.YYYY')} - ${end.format('DD.MM.YYYY')})`,
    };
}

function getCellValue({ isWorkday, isAvailable, hours }) {
    if (!isWorkday) return '-';
    if (isAvailable === false) return 'отпуск';
    return formatHours(hours);
}

function formatHours(hours) {
    const totalMinutes = Math.round(Number(hours || 0) * 60);
    const fullHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (minutes === 0) {
        return `${fullHours}ч`;
    }

    if (fullHours === 0) {
        return `${minutes}м`;
    }

    return `${fullHours}ч ${minutes}м`;
}

function normalizeDateKey(value) {
    const parsed = moment.parseZone(value, ['YYYY-MM-DD', moment.ISO_8601], true);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : String(value || '').slice(0, 10);
}

function getAvailabilityByEmail(result, email) {
    if (!result || typeof result !== 'object') return null;
    const exact = result[email];
    if (exact && typeof exact === 'object') return exact;

    const normalizedEmail = String(email || '').toLowerCase();
    const matchedKey = Object.keys(result).find((key) => String(key || '').toLowerCase() === normalizedEmail);
    return matchedKey && result[matchedKey] && typeof result[matchedKey] === 'object'
        ? result[matchedKey]
        : null;
}

function normalizeAvailabilityValue(value) {
    if (value === false || value === 0 || value === '0') return false;
    if (typeof value === 'string' && value.toLowerCase() === 'false') return false;
    return true;
}

class WorklogReportService {
    constructor(options = {}) {
        this.dayOffService = options.dayOffService || dayOffService;
        this.absenceService = options.absenceService || absenceService;
        this.jiraService = options.jiraService || JiraService;
        this.mattermost = options.mattermost || {
            getAllChannelMembers,
            getUser,
            getChannelById,
            postMessage,
        };
    }

    async shouldRun(setting) {
        if (!Number(setting.is_enabled)) return false;
        if (!Number(setting.run_on_workdays_only)) return true;
        return !(await this.dayOffService.isHoliday(moment.utc()));
    }

    async sendConfiguredReport(setting, options = {}) {
        if (!(await this.shouldRun(setting)) && !options.force) {
            logger.info(`[WorklogReport] Skip report ${setting.id}: non-working launch day`);
            return { status: 'skipped' };
        }

        const report = await this.buildReport(setting, options);
        await this.mattermost.postMessage(setting.target_channel_id, report.message);
        logger.info(`[WorklogReport] Report sent: id=${setting.id}, users=${report.users.length}, problems=${report.problemUsers.length}`);
        return { status: 'sent', report };
    }

    async buildReport(setting, options = {}) {
        const period = getPeriodRange(setting.period_preset, options.baseDate);
        const sourceChannelPromise = this.getChannelLabel(setting.source_channel_id);
        const usersPromise = this.getChannelUsers(setting.source_channel_id);
        const workdaysPromise = this.getWorkdays(period.dates);
        const [sourceChannel, users, workdays] = await Promise.all([sourceChannelPromise, usersPromise, workdaysPromise]);
        const visibleDates = period.dates.filter((date) => workdays[date]);
        const [availability, worklogResult] = await Promise.all([
            this.getAvailability(users, visibleDates),
            this.getWorklogHours(users, period),
        ]);
        const hoursByUser = worklogResult.hoursByUser || worklogResult;
        const rows = this.buildRows(users, visibleDates, workdays, availability, hoursByUser);
        const problemUsers = rows.filter((row) => row.hasProblem);
        const showMode = normalizeShowMode(setting.show_mode);
        const visibleRows = showMode === SHOW_MODES.problems ? problemUsers : rows;
        const table = this.buildMarkdownTable(visibleDates, visibleRows);
        const summary = this.buildSummary(rows, problemUsers, visibleDates, showMode);
        const message = this.applyTemplate(setting.message_template, {
            period: period.label,
            source_channel: sourceChannel,
            generated_at: moment.utc().format('DD.MM.YYYY HH:mm UTC'),
            show_mode: showMode === SHOW_MODES.problems ? 'только проблемные' : 'все участники',
            summary,
            table,
        });

        return {
            period,
            sourceChannel,
            users,
            rows,
            problemUsers,
            visibleDates,
            summary,
            table,
            message,
        };
    }

    async getChannelLabel(channelId) {
        try {
            const channel = await this.mattermost.getChannelById(channelId);
            return channel?.display_name || channel?.name || channelId;
        } catch (error) {
            logger.warn(`[WorklogReport] Could not resolve channel ${channelId}: ${error.message}`);
            return channelId;
        }
    }

    async getChannelUsers(channelId) {
        const members = await this.mattermost.getAllChannelMembers(channelId);
        const users = await Promise.all(
            members.map(async (member) => {
                try {
                    return await this.mattermost.getUser(member.user_id);
                } catch (error) {
                    logger.warn(`[WorklogReport] Не удалось загрузить пользователя ${member.user_id}: ${error.message}`);
                    return null;
                }
            })
        );

        return users
            .filter((user) => user && !user.is_bot && !Number(user.delete_at || 0) && user.email && user.username)
            .map((user) => ({
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: getDisplayName(user),
            }))
            .sort((a, b) => a.username.localeCompare(b.username));
    }

    async getWorkdays(dates) {
        const entries = await Promise.all(dates.map(async (date) => [
            date,
            !(await this.dayOffService.isHoliday(moment.utc(date, 'YYYY-MM-DD'))),
        ]));
        return Object.fromEntries(entries);
    }

    async getAvailability(users, dates) {
        const fallback = {};
        for (const user of users) {
            fallback[user.email] = {};
            for (const date of dates) {
                fallback[user.email][date] = true;
            }
        }

        if (!users.length || !dates.length) {
            return fallback;
        }

        try {
            const result = await this.absenceService.checkEmployeeAvailabilityByDate({
                employeeEmails: users.map((user) => user.email),
                dates,
            });

            if (!result || typeof result !== 'object') {
                return fallback;
            }

            const normalized = { ...fallback };
            for (const user of users) {
                const userAvailability = getAvailabilityByEmail(result, user.email);
                if (!userAvailability) {
                    logger.warn(`[WorklogReport] Absence service did not return availability for ${user.email}`);
                    continue;
                }

                for (const [dateKey, isAvailable] of Object.entries(userAvailability)) {
                    const normalizedDate = normalizeDateKey(dateKey);
                    if (dates.includes(normalizedDate)) {
                        const normalizedValue = normalizeAvailabilityValue(isAvailable);
                        normalized[user.email][normalizedDate] = normalizedValue;
                    }
                }
            }

            return normalized;
        } catch (error) {
            logger.warn(`[WorklogReport] Не удалось проверить отсутствия, считаю всех доступными: ${error.message}`);
            return fallback;
        }
    }

    async getWorklogHours(users, period) {
        const hoursByUser = {};
        for (const user of users) {
            hoursByUser[user.username] = {};
            for (const date of period.dates) {
                hoursByUser[user.username][date] = 0;
            }
        }

        if (!users.length) {
            return { hoursByUser, completeness: null };
        }

        const tempoReport = await this.getTempoWorklogReport(users, period);
        for (const user of users) {
            for (const [date, hours] of Object.entries(tempoReport.hoursByUser[user.username] || {})) {
                if (Object.prototype.hasOwnProperty.call(hoursByUser[user.username], date)) {
                    hoursByUser[user.username][date] = Number(hours || 0);
                }
            }
        }

        return { hoursByUser, completeness: null };
    }

    async getTempoWorklogReport(users, period) {
        if (typeof this.jiraService.fetchWorklogReport !== 'function') {
            throw new Error('Tempo worklog report endpoint is not available');
        }

        return await this.jiraService.fetchWorklogReport({
            users: users.map((user) => ({
                id: user.id,
                username: user.username,
                email: user.email,
            })),
            startDate: period.start,
            endDate: period.end,
        });
    }

    buildRows(users, visibleDates, workdays, availability, hoursByUser) {
        return users.map((user) => {
            const cells = {};
            let hasProblem = false;
            let totalHours = 0;

            for (const date of visibleDates) {
                const hours = Number(hoursByUser[user.username]?.[date] || 0);
                const isAvailable = availability[user.email]?.[date] !== false;
                const isWorkday = Boolean(workdays[date]);
                cells[date] = getCellValue({ isWorkday, isAvailable, hours });
                totalHours += hours;
                if (isWorkday && isAvailable && hours <= 0) {
                    hasProblem = true;
                }
            }

            return {
                user,
                cells,
                totalHours,
                hasProblem,
            };
        });
    }

    buildMarkdownTable(dates, rows) {
        if (!dates.length) {
            return '_За период нет рабочих дней._';
        }
        if (!rows.length) {
            return '_Проблем не найдено._';
        }

        const headers = ['Пользователь', ...dates.map(formatDateHeader), 'Итого'];
        const separator = headers.map(() => '---');
        const lines = [
            `| ${headers.join(' | ')} |`,
            `| ${separator.join(' | ')} |`,
        ];

        for (const row of rows) {
            lines.push(`| @${row.user.username} | ${dates.map((date) => row.cells[date]).join(' | ')} | ${formatHours(row.totalHours)} |`);
        }

        return lines.join('\n');
    }

    buildSummary(rows, problemUsers, visibleDates, showMode) {
        const modeText = showMode === SHOW_MODES.problems
            ? 'показаны только участники с рабочими днями без таймлогов'
            : 'показаны все участники канала';
        const lines = [
            `Участников: ${rows.length}. Проблемных: ${problemUsers.length}. Рабочих дней в отчете: ${visibleDates.length}.`,
            `Режим: ${modeText}.`,
            'Обозначения: `0ч` - нет таймлога в рабочий день, `отпуск` - сотрудник недоступен по календарю.',
        ];

        return lines.join('\n');
    }

    applyTemplate(template, values) {
        const source = template || [
            '### Таймлоги Jira за {period}',
            '',
            '{summary}',
            '',
            '{table}',
        ].join('\n');

        return source.replace(/\{(\w+)\}/g, (match, key) => (
            Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
        ));
    }
}

function formatDateHeader(date) {
    const parsed = moment.utc(date, 'YYYY-MM-DD');
    return `${WEEKDAY_LABELS[parsed.day()]} ${parsed.format('DD.MM')}`;
}

const defaultService = new WorklogReportService();

module.exports = defaultService;
module.exports.WorklogReportService = WorklogReportService;
module.exports.PERIOD_PRESETS = PERIOD_PRESETS;
module.exports.SHOW_MODES = SHOW_MODES;
module.exports.PERIOD_LABELS = PERIOD_LABELS;
module.exports.getPeriodRange = getPeriodRange;
module.exports.formatHours = formatHours;
