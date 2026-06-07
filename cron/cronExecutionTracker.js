/**
 * Трекер выполнения критичных cron-задач.
 * Хранит время последнего успеха в БД (переживает перезапуск приложения),
 * определяет задачи для принудительного retry, если по расписанию задача должна была выполниться,
 * но успех не зафиксирован.
 */
const parser = require('cron-parser');
const logger = require('../logger');
const { upsertLastSuccess, getLastSuccessByKeys } = require('../db/models/cronJobState');

/** SQLite datetime('now') возвращает UTC без суффикса Z; JS иначе парсит как local. */
function parseLastSuccessAt(value) {
    if (!value) return null;
    const s = String(value).trim();
    return new Date(s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}

class CronExecutionTracker {
    constructor() {
        /** Метаданные для расчёта «нужен retry»; runner хранится только в сервисе. */
        /** @type {Map<string, { schedule: string, tz: string }>} */
        this.criticalJobMeta = new Map();
    }

    /**
     * Регистрирует метаданные критичной задачи (расписание, tz). Runner хранится в сервисе.
     * @param {string} key — уникальный ключ задачи (например duty_1)
     * @param {string} schedule — cron-выражение
     * @param {{ tz?: string }} [options] — опции (часовой пояс)
     */
    registerCriticalJob(key, schedule, options = {}) {
        this.criticalJobMeta.set(key, {
            schedule,
            tz: options.tz || 'UTC',
        });
        logger.info(`[CronExecutionTracker] Зарегистрирована критичная задача: ${key}`);
    }

    /**
     * Удаляет задачу из отслеживания (при удалении джобы из сервиса).
     * @param {string} key
     */
    unregisterCriticalJob(key) {
        this.criticalJobMeta.delete(key);
    }

    /**
     * Фиксирует начало выполнения задачи (только в памяти, для отладки).
     * @param {string} key
     */
    recordStart(key) {
        // Состояние успеха хранится в БД; старт можно при необходимости тоже персистить
    }

    /**
     * Фиксирует успешное завершение задачи в БД (переживает перезапуск приложения).
     * @param {string} key
     */
    async recordSuccess(key) {
        try {
            await upsertLastSuccess(key);
        } catch (err) {
            logger.error(`[CronExecutionTracker] Ошибка записи успеха для ${key}: ${err.message}`);
        }
    }

    /**
     * Фиксирует неуспешное завершение (ошибка или бизнес-отказ).
     * @param {string} key
     */
    recordFailure(key) {
        // lastRunAt уже установлен; lastSuccessAt не обновляем
    }

    /**
     * Возвращает список задач, которые по расписанию уже должны были выполниться,
     * но успех не зафиксирован в БД (не выполнялись, упали или приложение перезапускалось).
     * @param {{ toleranceMs?: number }} [options] — допуск: не считать "просроченной", если последний ожидаемый запуск был недавно
     * @returns {Promise<Array<{ key: string, lastExpectedRun: Date }>>} без callback — запуск через CronManager
     */
    async getJobsNeedingRetry(options = {}) {
        const toleranceMs = options.toleranceMs ?? 60000; // 1 минута по умолчанию
        const now = new Date();
        const keys = Array.from(this.criticalJobMeta.keys());
        if (keys.length === 0) return [];

        /** @type {Map<string, Date>} */
        const lastSuccessByKey = new Map();
        try {
            const rows = await getLastSuccessByKeys(keys);
            for (const row of rows) {
                const at = parseLastSuccessAt(row.last_success_at);
                if (at) lastSuccessByKey.set(row.job_key, at);
            }
        } catch (err) {
            logger.error(`[CronExecutionTracker] Ошибка чтения состояния из БД: ${err.message}`);
            return [];
        }

        const result = [];
        for (const [key, meta] of this.criticalJobMeta) {
            try {
                const parseOptions = { currentDate: now };
                if (meta.tz) parseOptions.tz = meta.tz;
                const interval = parser.parseExpression(meta.schedule, parseOptions);
                const lastExpectedRun = interval.prev().toDate();
                const lastSuccessAt = lastSuccessByKey.get(key);

                const successAfterExpected = lastSuccessAt && lastSuccessAt >= lastExpectedRun;
                const tooRecent = now.getTime() - lastExpectedRun.getTime() < toleranceMs;
                if (!successAfterExpected && !tooRecent) {
                    result.push({ key, lastExpectedRun });
                }
            } catch (err) {
                logger.error(`[CronExecutionTracker] Ошибка разбора расписания для ${key}: ${err.message}`);
            }
        }

        return result;
    }
}

module.exports = new CronExecutionTracker();
