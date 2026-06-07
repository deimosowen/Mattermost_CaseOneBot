const db = require('../index.js');

/**
 * Записать время последнего успешного выполнения задачи (upsert по job_key).
 * @param {string} jobKey
 */
const upsertLastSuccess = async (jobKey) => {
    await db.runAsync(
        `INSERT OR REPLACE INTO cron_job_state (job_key, last_success_at, updated_at)
         VALUES (?, datetime('now'), datetime('now'))`,
        [jobKey]
    );
};

/**
 * Получить last_success_at для переданных ключей.
 * @param {string[]} jobKeys
 * @returns {Promise<Array<{ job_key: string, last_success_at: string|null }>>}
 */
const getLastSuccessByKeys = async (jobKeys) => {
    if (jobKeys.length === 0) return [];
    const placeholders = jobKeys.map(() => '?').join(',');
    return db.all(
        `SELECT job_key, last_success_at FROM cron_job_state WHERE job_key IN (${placeholders})`,
        jobKeys
    );
};

module.exports = {
    upsertLastSuccess,
    getLastSuccessByKeys,
};
