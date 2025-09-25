const { Gitlab } = require('@gitbeaker/rest');
const {
    getProjectByName,
    addProject,
    getMergeRequestById,
    addMergeRequest: addMergeRequestToDb,
    updateMergeRequestStatus, } = require('../db/models/gitlab');
const cache = require('../services/cacheService');
const config = require('../config');
const logger = require('../logger');

const STATUSES = {
    NEW: "new",
    APPROVED: "approved",
    REJECTED: "rejected",
    COMMENTED: "commented",
    DRAFT: "draft",
    MERGED: "merged",
    CLOSED: "closed",
};

const STATE_MAP = {
    merged: "merged",
    closed: "closed",
    opened: null,
};

class GitlabService {
    constructor() {
        this.client = new Gitlab({
            host: config.GITLAB_BASE_URL,
            token: config.GITLAB_API_TOKEN,
        });
    }

    /**
     * Поиск Проекта по имени через API GitLab.
     */
    async findProjectByName(projectName) {
        try {
            const projects = await this.client.Projects.search(projectName);
            return projects.find(project => project.name === projectName);
        }
        catch (error) {
            logger.error(`Ошибка при поиске проекта "${projectName}": ${error.message}`);
        }
    }

    /**
     * Получение проекта по имени из базы данных.
     * Если проект не найден, ищем его через API GitLab.
     * Если найден, сохраняем в БД.
     */
    async getProjectByName(name) {
        try {
            const cacheKey = `project:${name}`;

            if (cache.has(cacheKey)) {
                return cache.get(cacheKey);
            }

            let project = await getProjectByName(name);
            if (!project) {
                project = await this.findProjectByName(name);
                if (project) {
                    await addProject({
                        id: project.id,
                        name: project.name,
                    });

                    project = {
                        project_id: project.id,
                        project_name: project.name,
                    };
                }
            }

            if (project) {
                cache.set(cacheKey, project);
            }

            return project;
        } catch (error) {
            logger.error(`Ошибка при получении проекта "${name}": ${error.message}`);
        }
    }

    /**
     * Добавление нового merge request в БД.
     * Если MR уже существует, возвращаем его.
     */
    async addMergeRequest(mr) {
        try {
            const existing = await getMergeRequestById(mr.project_id, mr.mr_iid);
            if (existing) {
                logger.warn(`Merge request ${mr.mr_iid} уже существует в БД.`);
                return existing;
            }
            const lastId = await addMergeRequestToDb({
                project_id: mr.project_id,
                mr_iid: mr.mr_iid,
                status: mr.status,
            });
            return lastId;
        }
        catch (error) {
            logger.error(`Ошибка при добавлении merge request ${mr.mr_iid}: ${error.message}`);
        }
    }

    /**
     * Получение агрегированного статуса MR.
     */
    async getMergeRequestStatus(projectId, mrIid) {
        try {
            const [mr, approval, discussions] = await Promise.all([
                this.client.MergeRequests.show(projectId, mrIid),
                this.client.MergeRequestApprovals.showApprovalState(projectId, mrIid),
                this.client.MergeRequestDiscussions.all(projectId, mrIid),
            ]);

            const status = this._determineStatus(mr, approval, discussions);
            const hasComments = this._hasComments(discussions);

            return {
                id: mr.id,
                iid: mr.iid,
                title: mr.title,
                author: mr.author?.name,
                webUrl: mr.web_url,
                state: mr.state,
                mergeStatus: mr.merge_status,
                draft: mr.draft === true,
                status,
                hasComments,
            };
        } catch (error) {
            logger.error(`Ошибка при получении статуса MR ${mrIid}: ${error.message}`);
        }
    }

    /**
     * Обновление статуса MR в БД.
     */
    async updateReviewTaskStatus(id, status) {
        try {
            const updated = await updateMergeRequestStatus(id, status);
        }
        catch (error) {
            logger.error(`Ошибка при обновлении статуса MR ${id}: ${error.message}`);
        }
    }

    // --- приватные методы ---

    _determineStatus(mr, approval, discussions) {
        if (this._isDraft(mr)) {
            return STATUSES.DRAFT;
        }

        if (STATE_MAP[mr.state]) {
            return STATUSES[STATE_MAP[mr.state].toUpperCase()];
        }

        if (this._isRejected(discussions)) {
            return STATUSES.REJECTED;
        }

        if (this._isApproved(approval)) {
            return STATUSES.APPROVED;
        }

        if (this._hasComments(discussions)) {
            return STATUSES.COMMENTED;
        }

        return STATUSES.NEW;
    }

    _isDraft(mr) {
        return mr.draft === true || /^draft:/i.test(mr.title);
    }

    _isApproved(approval) {
        if (!approval?.rules) return false;
        return approval.rules.some(rule => rule.approved && rule.approved_by?.length > 0);
    }

    _isRejected(discussions) {
        return discussions.some(d =>
            d.notes?.some(n =>
                n.system && /requested\s+changes/i.test(n.body)
            )
        );
    }

    _hasComments(discussions) {
        return discussions.some(d =>
            d.notes?.some(n => !n.system && n.body?.trim().length > 0)
        );
    }
}

module.exports = new GitlabService();
module.exports.STATUSES = STATUSES;
