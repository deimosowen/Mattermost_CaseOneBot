const db = require('../index.js');

//Получения проекта по имени
const getProjectByName = async (name) => {
    try {
        const projects = await db.all(`SELECT * FROM gitlab_projects WHERE project_name = ?`, [name]);
        return projects.length > 0 ? projects[0] : null;
    } catch (err) {
        throw err;
    }
}

//Добавление нового проекта
const addProject = async (project) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO gitlab_projects (project_id, project_name) VALUES (?, ?)`,
            [project.id, project.name],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

//Добавление нового merge request
const addMergeRequest = async (mr) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO gitlab_merge_requests (project_id, mr_iid, status)
             VALUES (?, ?, ?)`,
            [mr.project_id, mr.mr_iid, mr.status],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

//Обновление статуса merge request.
const updateMergeRequestStatus = async (id, status) => {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE gitlab_merge_requests SET status = ? WHERE id = ?`,
            [status, id],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}


//Получиение merge request по ID
const getMergeRequestById = async (projectId, mrIid) => {
    try {
        const row = await db.get(`SELECT * FROM gitlab_merge_requests WHERE project_id = ? AND mr_iid = ?`, [projectId, mrIid]);
        return row || null;
    } catch (err) {
        throw err;
    }
}

// Получение merge requests по статусу
const getMergeRequestsByStatus = async (status) => {
    try {
        const rows = await db.all(`SELECT * FROM gitlab_merge_requests WHERE status = ?`, [status]);
        return rows || [];
    } catch (err) {
        throw err;
    }
}

//Получает merge requests по не закрытым статусам
const getMergeRequestsByOpenStatuses = async () => {
    try {
        const rows = await db.all(`SELECT * FROM gitlab_merge_requests WHERE status NOT IN (?, ?)`, ['merged', 'closed']);
        return rows || [];
    } catch (err) {
        throw err;
    }
}

//Удаление merge request по ID
const deleteMergeRequestById = async (id) => {
    return new Promise((resolve, reject) => {
        db.run(
            `DELETE FROM gitlab_merge_requests WHERE id = ?`,
            [id],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

module.exports = {
    getProjectByName,
    addProject,
    addMergeRequest,
    getMergeRequestById,
    updateMergeRequestStatus,
    getMergeRequestsByStatus,
    deleteMergeRequestById,
    getMergeRequestsByOpenStatuses,
};