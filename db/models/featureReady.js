const db = require('../index.js');
const logger = require('../../logger');

const getFeatureReadyById = async (id) => {
    return db.get('SELECT * FROM feature_ready WHERE id = ?', id);
}

const getFeatureReadyByPostId = async (postId) => {
    return db.get('SELECT * FROM feature_ready WHERE mattermost_post_id = ?', postId);
}

const getFeaturesWithOpenMRs = async () => {
    return db.all(`
        SELECT 
            fr.*,
            fmr.merge_request_id,
            fmr.role,
            gmr.mr_iid,
            gmr.project_id,
            gmr.status AS mr_status
        FROM feature_ready fr
        JOIN feature_merge_requests fmr ON fr.id = fmr.feature_id
        JOIN gitlab_merge_requests gmr ON fmr.merge_request_id = gmr.id
        WHERE gmr.status != 'MERGED'
    `);
};

const addFeatureReady = async (data, mrs, mattermostPostId) => {
    const {
        taskId,
        taskName,
        mergeTaskId,
        description
    } = data;

    await db.execAsync('BEGIN TRANSACTION');

    try {
        const result = await db.runAsync(`
            INSERT INTO feature_ready (task_id, task_name, description, merge_tasks, mattermost_post_id)
            VALUES (?, ?, ?, ?, ?)
        `, [
            taskId,
            taskName || null,
            description || null,
            mergeTaskId || null,
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
}