const { Gitlab } = require('@gitbeaker/rest');
const {
    getProjectByName,
    addProject,
    getMergeRequestById,
    addMergeRequest: addMergeRequestToDb,
    updateMergeRequestStatus, } = require('../../db/models/gitlab');
const cache = require('../cacheService');
const config = require('../../config');
const logger = require('../../logger');

const STATUSES = {
    NEW: "new",
    APPROVED: "approved",
    REJECTED: "rejected",
    COMMENTED: "commented",
    DRAFT: "draft",
    MERGED: "merged",
    CLOSED: "closed",
};

const FINAL_STATUSES = [
    STATUSES.MERGED,
    STATUSES.CLOSED,
];

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
     * Получиние MR по ID.
     */
    async getMergeRequestById(projectId, mrIid) {
        try {
            const mr = await this.client.MergeRequests.show(projectId, mrIid);
            if (!mr) {
                return null;
            }

            return {
                id: mr.id,
                iid: mr.iid,
                title: mr.title,
                hasConflicts: mr.has_conflicts,
            }
        } catch (error) {
            logger.error(error);
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

    /**
     * Проверяет, является ли статус финальным (не требует дальнейшего отслеживания).
     */
    isFinalStatus(status) {
        return FINAL_STATUSES.includes(status);
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

    /**
     * Получение содержимого файла из ветки MR
     * @param {number} projectId - ID проекта
     * @param {string} filePath - Путь к файлу
     * @param {string} ref - Ветка (source_branch из MR)
     * @returns {Promise<string|null>} - Содержимое файла
     */
    async getFileContent(projectId, filePath, ref) {
        try {
            const file = await this.client.RepositoryFiles.show(projectId, filePath, ref);
            if (file && file.content) {
                return Buffer.from(file.content, 'base64').toString('utf-8');
            }
            return null;
        } catch (error) {
            logger.error(`Ошибка при получении содержимого файла ${filePath}: ${error.message}`);
            return null;
        }
    }

    /**
     * Обновление файла в репозитории
     * @param {number} projectId - ID проекта
     * @param {string} filePath - Путь к файлу
     * @param {string} branch - Ветка
     * @param {string} content - Новое содержимое файла
     * @param {string} commitMessage - Сообщение коммита
     * @returns {Promise<boolean>} - Успешно ли обновлен файл
     */
    async updateFile(projectId, filePath, branch, content, commitMessage) {
        try {
            const contentBase64 = Buffer.from(content, 'utf-8').toString('base64');
            await this.client.RepositoryFiles.edit(projectId, filePath, branch, {
                content: contentBase64,
                commit_message: commitMessage,
            });
            return true;
        } catch (error) {
            logger.error(`Ошибка при обновлении файла ${filePath}: ${error.message}`);
            return false;
        }
    }

    /**
     * Получение информации о MR (включая source_branch)
     * @param {number} projectId - ID проекта
     * @param {number} mrIid - IID MR
     * @returns {Promise<Object|null>} - Информация о MR
     */
    async getMergeRequestInfo(projectId, mrIid) {
        try {
            const mr = await this.client.MergeRequests.show(projectId, mrIid);
            return mr ? {
                source_branch: mr.source_branch,
                target_branch: mr.target_branch,
                has_conflicts: mr.has_conflicts,
            } : null;
        } catch (error) {
            logger.error(`Ошибка при получении информации о MR ${mrIid}: ${error.message}`);
            return null;
        }
    }
}

module.exports = new GitlabService();
module.exports.STATUSES = STATUSES;
module.exports.FINAL_STATUSES = FINAL_STATUSES;
