const db = require('../index.js');
const JiraStatusType = require('../../types/jiraStatusTypes');

const getReviewTaskByKey = async (task_key) => {
    try {
        const row = await db.get(`SELECT * FROM review_task WHERE task_key = ?`, [task_key]);
        return row || null;
    } catch (err) {
        throw err;
    }
}

const getReviewTaskWithNotClosedMRs = async () => {
    try {
        const rows = await db.all(`
            SELECT rt.*, gmr.project_id, gmr.mr_iid, gmr.status AS mr_status
            FROM review_task rt
            JOIN gitlab_merge_requests gmr ON rt.gitlab_merge_request_id = gmr.id
            WHERE gmr.status NOT IN (?, ?)
        `, ['merged', 'closed']);
        return rows || [];
    }
    catch (err) {
        throw err;
    }
}

const getReviewTaskByGitlabMergeRequestId = async (gitlab_merge_request_id) => {
    try {
        const row = await db.get(`SELECT * FROM review_task WHERE gitlab_merge_request_id = ?`, [gitlab_merge_request_id]);
        return row || null;
    } catch (err) {
        throw err;
    }
}

const getReviewTaskByPostId = async (post_id) => {
    try {
        const row = await db.get(`SELECT * FROM review_task WHERE post_id = ?`, [post_id]);
        return row || null;
    } catch (err) {
        throw err;
    }
}

const getReviewTasksByStatus = async (status) => {
    try {
        const rows = await db.all(`SELECT * FROM review_task WHERE status = ?`, [status]);
        return rows || [];
    } catch (err) {
        throw err;
    }
}

const getNotClosedReviewTasks = async () => {
    try {
        const rows = await db.all(`SELECT * FROM review_task WHERE status NOT IN (?, ?)`, [JiraStatusType.CLOSED, JiraStatusType.DONE]);
        return rows || [];
    } catch (err) {
        throw err;
    }
}

const addReviewTask = async (task) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO review_task (channel_id, post_id, user_id, task_key, merge_request_url, reviewer, gitlab_merge_request_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [task.channel_id, task.post_id, task.user_id, task.task_key, task.merge_request_url, task.reviewer, task.gitlab_merge_request_id],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

const updateReviewTaskStatus = async (task) => {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE review_task SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE task_key = ?`,
            [task.status, task.task_key],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

const updateReviewTaskReviewer = async (task) => {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE review_task SET reviewer = ? WHERE task_key = ?`,
            [task.reviewer, task.task_key],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

const updateReviewTaskMetadata = async (task) => {
    const updates = [];
    const params = [];

    if (task.channel_id !== undefined) {
        updates.push('channel_id = ?');
        params.push(task.channel_id);
    }
    if (task.post_id !== undefined) {
        updates.push('post_id = ?');
        params.push(task.post_id);
    }
    if (task.user_id !== undefined) {
        updates.push('user_id = ?');
        params.push(task.user_id);
    }
    if (task.merge_request_url !== undefined) {
        updates.push('merge_request_url = ?');
        params.push(task.merge_request_url);
    }
    if (task.gitlab_merge_request_id !== undefined) {
        updates.push('gitlab_merge_request_id = ?');
        params.push(task.gitlab_merge_request_id);
    }

    if (!updates.length) {
        return 0;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(task.task_key);

    const result = await db.runAsync(`
        UPDATE review_task
        SET ${updates.join(', ')}
        WHERE task_key = ?
    `, params);
    return result.changes;
}

const getTaskNotifications = async (review_task_id) => {
    try {
        const rows = await db.all(`SELECT * FROM review_task_notification WHERE review_task_id = ? ORDER BY created_at DESC`, [review_task_id]);
        return rows || [];
    } catch (err) {
        throw err;
    }
}

const addTaskNotification = async (review_task_id) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO review_task_notification (review_task_id) VALUES (?)`,
            [review_task_id],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

const deleteTaskReview = async (review_task_id) => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(
                'DELETE FROM review_task_notification WHERE review_task_id = ?',
                [review_task_id],
                (err) => {
                    if (err) return reject(err);
                }
            );

            db.run(
                'DELETE FROM review_task WHERE id = ?',
                [review_task_id],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.changes);
                }
            );
        });
    });
};

const deleteReviewTasksByGitlabMergeRequestId = async (gitlab_merge_request_id) => {
    const result = await db.runAsync(
        'DELETE FROM review_task WHERE gitlab_merge_request_id = ?',
        [gitlab_merge_request_id]
    );
    return result.changes;
};


module.exports = {
    getReviewTaskByKey,
    getReviewTaskByPostId,
    getReviewTasksByStatus,
    getNotClosedReviewTasks,
    addReviewTask,
    updateReviewTaskStatus,
    updateReviewTaskReviewer,
    updateReviewTaskMetadata,
    getTaskNotifications,
    addTaskNotification,
    deleteTaskReview,
    deleteReviewTasksByGitlabMergeRequestId,
    getReviewTaskByGitlabMergeRequestId,
    getReviewTaskWithNotClosedMRs,
}
