const moment = require('moment-timezone');
const { postMessageInTreed } = require('../../mattermost/utils');
const { getForwardMessagesByTargetChannelId } = require('../../db/models/forward');
const logger = require('../../logger');

/**
 * Конфигурация отчёта
 */
const config = {
    topUsersCount: 3,
    locale: 'ru',
    timezone: 'UTC',
    metrics: {
        totalMessages: true,
        topUsers: true,
        weekdayDistribution: true,
        peakWeekday: true,
        todayChance: true,
        peakHour: true,
        hourDistribution: false,
    },
};

/** Русские названия дней недели начиная с воскресенья */
const ruWeekdays = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

/**
 * Собирает метрики по сообщениям
 * @param {Array} messages Массив объектов { user_name, timestamp }
 */
function collectMetrics(messages) {
    const total = messages.length;
    const userCounts = {};
    const weekdayCounts = {};
    const hourCounts = {};
    messages.forEach(({ user_name, timestamp }) => {
        userCounts[user_name] = (userCounts[user_name] || 0) + 1;

        const m = moment.tz(timestamp, config.timezone).locale(config.locale);
        const wd = m.isoWeekday() - 1; // 0..6 Monday..Sunday
        const hr = m.hour();

        weekdayCounts[wd] = (weekdayCounts[wd] || 0) + 1;
        hourCounts[hr] = (hourCounts[hr] || 0) + 1;
    });

    const weekdayDist = ruWeekdays.map((_, i) => (weekdayCounts[i] || 0) / total);
    const hourDist = Array.from({ length: 24 }, (_, i) => (hourCounts[i] || 0) / total);

    return { total, userCounts, weekdayDist, hourDist };
}

/**
 * Находит индекс максимума в массиве
 */
function argMax(arr) {
    return arr.reduce((best, _, idx, a) => (a[idx] > a[best] ? idx : best), 0);
}

/**
 * Генерирует Markdown-таблицу
 */
function renderTable(headers, rows) {
    const line = arr => `| ${arr.join(' | ')} |`;
    const sep = `| ${headers.map(() => '---').join(' | ')} |`;
    return [line(headers), sep, ...rows.map(line)].join('\n');
}

/**
 * Формирует Markdown-отчёт на основе метрик
 */
function renderReport({ total, userCounts, weekdayDist, hourDist }) {
    const lines = ['**Статистика пересланных сообщений**', ''];

    if (config.metrics.totalMessages) {
        lines.push(`- Всего сообщений: **${total}**`);
    }

    if (config.metrics.topUsers) {
        lines.push(`- Топ ${config.topUsersCount} отправителей:`);
        const top = Object.entries(userCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, config.topUsersCount);
        lines.push(renderTable(['Пользователь', 'Сообщений'], top));
    }

    if (config.metrics.peakWeekday) {
        const peakW = argMax(weekdayDist);
        lines.push(`- Самый активный день недели: **${ruWeekdays[peakW]}**`);
    }

    if (config.metrics.todayChance) {
        const todayW = moment().tz(config.timezone).isoWeekday() - 1;
        const chance = (weekdayDist[todayW] * 100).toFixed(2);
        lines.push(`- Вероятность сообщения **сегодня**: **${chance}%**`);
    }

    if (config.metrics.peakHour) {
        const peakH = argMax(hourDist);
        lines.push(`- Самый активный час: **${peakH}:00**`);
    }

    if (config.metrics.weekdayDistribution) {
        lines.push('**Распределение по дням недели:**');
        const rows = ruWeekdays.map((d, i) => [d, (weekdayDist[i] * 100).toFixed(2)]);
        lines.push(renderTable(['День недели', 'Доля (%)'], rows));
    }

    if (config.metrics.hourDistribution) {
        lines.push('**Распределение по часам:**');
        const hrRows = hourDist.map((v, i) => [`${i}:00`, (v * 100).toFixed(2)]);
        lines.push(renderTable(['Час', 'Доля (%)'], hrRows));
    }

    return lines.join('\n\n');
}

module.exports = async ({ post_id, channel_id }) => {
    try {
        const messages = await getForwardMessagesByTargetChannelId(channel_id);
        const metrics = collectMetrics(messages);
        const report = renderReport(metrics);
        await postMessageInTreed(post_id, report);
    } catch (err) {
        logger.error(err);
    }
};