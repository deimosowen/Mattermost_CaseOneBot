const express = require('express');
const cronValidator = require('cron-validator');
const {
    DEFAULT_TEMPLATE,
    addWorklogReportSetting,
    deleteWorklogReportSetting,
    getWorklogReportSettingById,
    getWorklogReportSettings,
    updateWorklogReportSetting,
} = require('../../db/models/worklogReportSettings');
const { getChannelById } = require('../../mattermost/utils');
const cronManager = require('../../cron/cronManager');
const CronServiceTypes = require('../../cron/сronServiceTypes');
const worklogReportService = require('../../services/worklogReportService');
const {
    PERIOD_LABELS,
    PERIOD_PRESETS,
    SHOW_MODES,
} = require('../../services/worklogReportService');
const logger = require('../../logger');

const router = express.Router();

function parseBoolean(value) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function normalizeText(value) {
    return String(value || '').trim();
}

function validatePayload(body) {
    const payload = {
        name: normalizeText(body.name),
        source_channel_id: normalizeText(body.source_channel_id),
        target_channel_id: normalizeText(body.target_channel_id),
        cron_schedule: normalizeText(body.cron_schedule),
        period_preset: Object.values(PERIOD_PRESETS).includes(body.period_preset)
            ? body.period_preset
            : PERIOD_PRESETS.previous_week,
        run_on_workdays_only: parseBoolean(body.run_on_workdays_only),
        show_mode: Object.values(SHOW_MODES).includes(body.show_mode) ? body.show_mode : SHOW_MODES.problems,
        message_template: normalizeText(body.message_template) || DEFAULT_TEMPLATE,
        is_enabled: parseBoolean(body.is_enabled),
    };

    if (!payload.name) throw new Error('Укажите название проверки');
    if (!payload.source_channel_id) throw new Error('Укажите канал, из которого брать участников');
    if (!payload.target_channel_id) throw new Error('Укажите канал для отчета');
    if (!payload.cron_schedule) throw new Error('Укажите cron-расписание');
    if (!cronValidator.isValidCron(payload.cron_schedule)) {
        throw new Error(`Недопустимое cron-расписание: "${payload.cron_schedule}"`);
    }

    return payload;
}

async function getChannelLabel(channelId) {
    try {
        const channel = await getChannelById(channelId);
        return channel?.display_name || channel?.name || channelId;
    } catch (error) {
        logger.warn(`Could not resolve channel ${channelId}: ${error.message}`);
        return channelId;
    }
}

async function enrichSettings(settings) {
    return Promise.all(settings.map(async (setting) => ({
        ...setting,
        source_channel_name: await getChannelLabel(setting.source_channel_id),
        target_channel_name: await getChannelLabel(setting.target_channel_id),
        period_label: PERIOD_LABELS[setting.period_preset] || PERIOD_LABELS[PERIOD_PRESETS.previous_week],
    })));
}

function refreshCronJob(setting) {
    const service = cronManager.get(CronServiceTypes.WORKLOG_REPORT);
    if (!service) return;
    service.refreshJob(setting);
}

router.get('/', async (_req, res) => {
    try {
        const settings = await enrichSettings(await getWorklogReportSettings());
        res.render('worklogReports', {
            error: null,
            settings,
            settingsJson: JSON.stringify(settings).replace(/</g, '\\u003c'),
            defaultTemplate: DEFAULT_TEMPLATE,
            periodLabels: PERIOD_LABELS,
        });
    } catch (error) {
        logger.error(`Error in worklog reports page: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).render('worklogReports', {
            error: 'Ошибка при загрузке настроек проверки таймлогов',
            settings: [],
            settingsJson: '[]',
            defaultTemplate: DEFAULT_TEMPLATE,
            periodLabels: PERIOD_LABELS,
        });
    }
});

router.post('/api/settings', async (req, res) => {
    try {
        const payload = validatePayload(req.body);
        const id = await addWorklogReportSetting(payload);
        const setting = await getWorklogReportSettingById(id);
        refreshCronJob(setting);
        res.json({ success: true, id, message: 'Проверка таймлогов создана' });
    } catch (error) {
        logger.warn(`Could not create worklog report setting: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

router.put('/api/settings/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Некорректный ID настройки' });
        }

        const existing = await getWorklogReportSettingById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Настройка не найдена' });
        }

        const payload = validatePayload(req.body);
        await updateWorklogReportSetting(id, payload);
        const setting = await getWorklogReportSettingById(id);
        refreshCronJob(setting);
        res.json({ success: true, message: 'Настройка обновлена' });
    } catch (error) {
        logger.warn(`Could not update worklog report setting: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

router.post('/api/settings/:id/run', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Некорректный ID настройки' });
        }

        const setting = await getWorklogReportSettingById(id);
        if (!setting) {
            return res.status(404).json({ error: 'Настройка не найдена' });
        }

        const result = await worklogReportService.sendConfiguredReport(setting, { force: true });
        res.json({ success: true, message: 'Отчет отправлен', result: { status: result.status } });
    } catch (error) {
        logger.error(`Could not run worklog report: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/api/settings/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Некорректный ID настройки' });
        }

        const changes = await deleteWorklogReportSetting(id);
        if (!changes) {
            return res.status(404).json({ error: 'Настройка не найдена' });
        }

        const service = cronManager.get(CronServiceTypes.WORKLOG_REPORT);
        service?.removeJob(id);
        res.json({ success: true, message: 'Настройка удалена' });
    } catch (error) {
        logger.error(`Could not delete worklog report setting: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
