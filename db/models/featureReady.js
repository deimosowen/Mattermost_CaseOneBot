const db = require('../index.js');
const logger = require('../../logger');

/**
 * Парсит merge_tasks из JSON строки в массив
 * @param {string|null} mergeTasksJson - JSON строка или null
 * @returns {string[]} - Массив ID задач
 */
const parseMergeTasks = (mergeTasksJson) => {
    if (!mergeTasksJson) {
        return [];
    }
    try {
        const parsed = JSON.parse(mergeTasksJson);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        logger.warn(`Failed to parse merge_tasks JSON: ${mergeTasksJson}`, err);
        // Для обратной совместимости: если это не JSON, пытаемся разбить как строку
        return String(mergeTasksJson).split(/[,\s;]+/).filter(Boolean);
    }
};

const getFeatureReadyById = async (id) => {
    const feature = await db.get('SELECT * FROM feature_ready WHERE id = ?', id);
    if (feature && feature.merge_tasks) {
        feature.merge_tasks_parsed = parseMergeTasks(feature.merge_tasks);
    }
    return feature;
}

const getFeatureReadyByPostId = async (postId) => {
    const feature = await db.get('SELECT * FROM feature_ready WHERE mattermost_post_id = ?', postId);
    if (feature && feature.merge_tasks) {
        feature.merge_tasks_parsed = parseMergeTasks(feature.merge_tasks);
    }
    return feature;
}

const getFeaturesWithOpenMRs = async () => {
    const { FINAL_STATUSES } = require('../../services/gitlabService');
    const placeholders = FINAL_STATUSES.map(() => '?').join(',');

    return db.all(`
        SELECT 
            fr.*,
            fmr.id AS feature_merge_request_id,
            fmr.merge_request_id,
            fmr.role,
            fmr.has_conflicts,
            COALESCE(fmr.conflict_announced, 0) AS conflict_announced,
            gmr.mr_iid,
            gmr.project_id,
            gmr.status AS mr_status
        FROM feature_ready fr
        JOIN feature_merge_requests fmr ON fr.id = fmr.feature_id
        JOIN gitlab_merge_requests gmr ON fmr.merge_request_id = gmr.id
        WHERE gmr.status NOT IN (${placeholders})
    `, FINAL_STATUSES);
};

const updateMergeRequestConflicts = async (featureMergeRequestId, hasConflicts, conflictAnnounced) => {
    const updates = ['has_conflicts = ?'];
    const params = [hasConflicts ? 1 : 0];

    if (conflictAnnounced !== undefined) {
        updates.push('conflict_announced = ?');
        params.push(conflictAnnounced ? 1 : 0);
    }

    params.push(featureMergeRequestId);

    return db.runAsync(
        `UPDATE feature_merge_requests SET ${updates.join(', ')} WHERE id = ?`,
        params
    );
};

const updateFeatureMergeRequestConflictState = async (featureId, role, hasConflicts, conflictAnnounced) => {
    return db.runAsync(
        `UPDATE feature_merge_requests
         SET has_conflicts = ?, conflict_announced = ?
         WHERE feature_id = ? AND role = ?`,
        [hasConflicts ? 1 : 0, conflictAnnounced ? 1 : 0, featureId, role]
    );
};

const addFeatureReady = async (data, mrs, mattermostPostId) => {
    const {
        taskId,
        taskName,
        mergeTaskId,
        description
    } = data;

    // Преобразуем mergeTaskId в JSON строку для структурированного хранения
    let mergeTasksJson = null;
    if (mergeTaskId) {
        if (Array.isArray(mergeTaskId)) {
            const normalizedIds = mergeTaskId
                .map(id => String(id).trim())
                .filter(Boolean);
            mergeTasksJson = normalizedIds.length > 0 ? JSON.stringify(normalizedIds) : null;
        } else if (String(mergeTaskId).trim()) {
            // Если строка, создаем массив из одного элемента
            mergeTasksJson = JSON.stringify([String(mergeTaskId).trim()]);
        }
    }

    await db.execAsync('BEGIN TRANSACTION');

    try {
        const result = await db.runAsync(`
            INSERT INTO feature_ready (task_id, task_name, description, merge_tasks, mattermost_post_id)
            VALUES (?, ?, ?, ?, ?)
        `, [
            taskId,
            taskName || null,
            description || null,
            mergeTasksJson,
            mattermostPostId || null
        ]);

        const featureId = result.lastID;

        for (const mr of mrs) {
            const project = await db.get(
                'SELECT project_id FROM gitlab_projects WHERE project_name = ?',
                [mr.data.project]
            );

            const gmr = await db.runAsync(
                'INSERT INTO gitlab_merge_requests (project_id, mr_iid, status) VALUES (?, ?, ?)',
                [project.project_id, mr.data.mrIid, 'NEW']
            );

            await db.runAsync(
                'INSERT INTO feature_merge_requests (feature_id, merge_request_id, role) VALUES (?, ?, ?)',
                [featureId, gmr.lastID, mr.tag]
            );
        }

        await db.execAsync('COMMIT');
        return featureId;
    } catch (err) {
        await db.execAsync('ROLLBACK');
        logger.error(err);
    }
}

const deleteFeatureReady = async (featureId) => {
    await db.transaction(async () => {
        const mrs = await db.all(`SELECT merge_request_id FROM feature_merge_requests WHERE feature_id = ?`, [featureId]);
        const mrIds = mrs.map(m => m.merge_request_id);

        await db.runAsync(`DELETE FROM feature_merge_requests WHERE feature_id = ?`, [featureId]);

        await db.runAsync(`DELETE FROM feature_ready WHERE id = ?`, [featureId]);

        for (const mrId of mrIds) {
            await db.runAsync(`DELETE FROM gitlab_merge_requests WHERE id = ?`, [mrId]);
        }
    });
};


module.exports = {
    getFeatureReadyById,
    getFeatureReadyByPostId,
    getFeaturesWithOpenMRs,
    addFeatureReady,
    deleteFeatureReady,
    parseMergeTasks,
    updateMergeRequestConflicts,
    updateFeatureMergeRequestConflictState,
}
