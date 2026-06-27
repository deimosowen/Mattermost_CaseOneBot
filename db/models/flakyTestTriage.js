const db = require('../index.js');

const upsertReviewContext = async (context) => {
    const existing = await db.get(
        'SELECT * FROM flaky_review_contexts WHERE review_task_id = ?',
        [context.review_task_id]
    );

    if (existing) {
        await db.runAsync(`
            UPDATE flaky_review_contexts
            SET gitlab_merge_request_id = ?,
                post_id = ?,
                channel_id = ?,
                author_user_id = ?,
                task_key = ?,
                merge_request_url = ?,
                is_active = 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE review_task_id = ?
        `, [
            context.gitlab_merge_request_id || null,
            context.post_id,
            context.channel_id || null,
            context.author_user_id || null,
            context.task_key,
            context.merge_request_url || null,
            context.review_task_id,
        ]);
        return existing.id;
    }

    const result = await db.runAsync(`
        INSERT INTO flaky_review_contexts
        (review_task_id, gitlab_merge_request_id, post_id, channel_id, author_user_id, task_key, merge_request_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
        context.review_task_id,
        context.gitlab_merge_request_id || null,
        context.post_id,
        context.channel_id || null,
        context.author_user_id || null,
        context.task_key,
        context.merge_request_url || null,
    ]);

    return result.lastID;
};

const getActiveReviewContexts = async () => {
    return db.all(`
        SELECT frc.*, gmr.project_id, gmr.mr_iid
        FROM flaky_review_contexts frc
        LEFT JOIN gitlab_merge_requests gmr ON frc.gitlab_merge_request_id = gmr.id
        WHERE frc.is_active = 1 AND frc.gitlab_merge_request_id IS NOT NULL
    `);
};

const addTestEvent = async (event) => {
    await db.runAsync(`
        INSERT OR IGNORE INTO flaky_test_events
        (build_id, build_config_id, build_number, build_url, test_name, test_identity, status, details, stacktrace)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        event.build_id,
        event.build_config_id || null,
        event.build_number || null,
        event.build_url || null,
        event.test_name,
        event.test_identity,
        event.status,
        event.details || null,
        event.stacktrace || null,
    ]);
};

const getRecentTestEvents = async (testIdentity, limit = 20) => {
    return db.all(`
        SELECT *
        FROM flaky_test_events
        WHERE test_identity = ?
        ORDER BY created_at DESC
        LIMIT ?
    `, [testIdentity, limit]);
};

const getPromptByReviewBuildTest = async (reviewTaskId, buildId, testIdentity) => {
    return db.get(`
        SELECT *
        FROM flaky_triage_prompts
        WHERE review_task_id = ? AND build_id = ? AND test_identity = ?
    `, [reviewTaskId, buildId, testIdentity]);
};

const createPrompt = async (prompt) => {
    const result = await db.runAsync(`
        INSERT OR IGNORE INTO flaky_triage_prompts
        (review_task_id, test_identity, test_name, build_id, build_url, jira_task_key, prompt_post_id, status, confidence, classifier_summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        prompt.review_task_id,
        prompt.test_identity,
        prompt.test_name,
        prompt.build_id,
        prompt.build_url || null,
        prompt.jira_task_key || null,
        prompt.prompt_post_id || null,
        prompt.status || 'waiting',
        prompt.confidence ?? null,
        prompt.classifier_summary || null,
    ]);
    return result.lastID;
};

const updatePrompt = async (id, data) => {
    const updates = [];
    const params = [];

    for (const [key, value] of Object.entries(data)) {
        updates.push(`${key} = ?`);
        params.push(value);
    }

    if (!updates.length) {
        return;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await db.runAsync(`
        UPDATE flaky_triage_prompts
        SET ${updates.join(', ')}
        WHERE id = ?
    `, params);
};

const getLatestWaitingPromptByReviewPostId = async (postId) => {
    return db.get(`
        SELECT ftp.*, frc.post_id, frc.task_key, frc.author_user_id
        FROM flaky_triage_prompts ftp
        JOIN flaky_review_contexts frc ON ftp.review_task_id = frc.review_task_id
        WHERE frc.post_id = ? AND ftp.status = 'waiting'
        ORDER BY ftp.created_at DESC
        LIMIT 1
    `, [postId]);
};

module.exports = {
    upsertReviewContext,
    getActiveReviewContexts,
    addTestEvent,
    getRecentTestEvents,
    getPromptByReviewBuildTest,
    createPrompt,
    updatePrompt,
    getLatestWaitingPromptByReviewPostId,
};
