const db = require('../index.js');

const DEFAULT_TEMPLATE = [
    '### Таймлоги Jira за {period}',
    '',
    '{summary}',
    '',
    '{table}',
].join('\n');

function toBoolInt(value) {
    return value ? 1 : 0;
}

async function getWorklogReportSettings({ includeDisabled = true } = {}) {
    const query = includeDisabled
        ? 'SELECT * FROM worklog_report_settings ORDER BY is_enabled DESC, id DESC'
        : 'SELECT * FROM worklog_report_settings WHERE is_enabled = 1 ORDER BY id DESC';
    return db.all(query);
}

async function getWorklogReportSettingById(id) {
    return db.get('SELECT * FROM worklog_report_settings WHERE id = ?', [id]);
}

async function addWorklogReportSetting(data) {
    const result = await db.runAsync(
        `INSERT INTO worklog_report_settings
            (name, source_channel_id, target_channel_id, cron_schedule, period_preset,
             run_on_workdays_only, show_mode, message_template, is_enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            data.name,
            data.source_channel_id,
            data.target_channel_id,
            data.cron_schedule,
            data.period_preset,
            toBoolInt(data.run_on_workdays_only),
            data.show_mode,
            data.message_template || DEFAULT_TEMPLATE,
            toBoolInt(data.is_enabled),
        ]
    );
    return result.lastID;
}

async function updateWorklogReportSetting(id, data) {
    const result = await db.runAsync(
        `UPDATE worklog_report_settings
         SET name = ?,
             source_channel_id = ?,
             target_channel_id = ?,
             cron_schedule = ?,
             period_preset = ?,
             run_on_workdays_only = ?,
             show_mode = ?,
             message_template = ?,
             is_enabled = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
            data.name,
            data.source_channel_id,
            data.target_channel_id,
            data.cron_schedule,
            data.period_preset,
            toBoolInt(data.run_on_workdays_only),
            data.show_mode,
            data.message_template || DEFAULT_TEMPLATE,
            toBoolInt(data.is_enabled),
            id,
        ]
    );
    return result.changes;
}

async function deleteWorklogReportSetting(id) {
    const result = await db.runAsync('DELETE FROM worklog_report_settings WHERE id = ?', [id]);
    return result.changes;
}

module.exports = {
    DEFAULT_TEMPLATE,
    getWorklogReportSettings,
    getWorklogReportSettingById,
    addWorklogReportSetting,
    updateWorklogReportSetting,
    deleteWorklogReportSetting,
};
