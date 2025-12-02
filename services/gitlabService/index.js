const { Gitlab } = require('@gitbeaker/rest');
const axios = require('axios');
const {
    getProjectByName,
    addProject,
    getMergeRequestById,
    addMergeRequest: addMergeRequestToDb,
    updateMergeRequestStatus, } = require('../../db/models/gitlab');
const cache = require('../cacheService');
const config = require('../../config');
const logger = require('../../logger');
const { parseGitlabMrUrl } = require('./gitlabHelper');

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
            // Получаем информацию о текущем файле для получения last_commit_id
            let lastCommitId = null;
            try {
                const fileInfo = await this.client.RepositoryFiles.show(projectId, filePath, branch);
                if (fileInfo && fileInfo.last_commit_id) {
                    lastCommitId = fileInfo.last_commit_id;
                }
            } catch (error) {
                logger.warn(`Не удалось получить информацию о файле ${filePath} для last_commit_id: ${error.message}`);
            }

            if (!content || content.trim().length === 0) {
                logger.error(`Попытка обновить файл ${filePath} с пустым содержимым`);
                return false;
            }

            if (!commitMessage || commitMessage.trim().length === 0) {
                logger.error(`Попытка обновить файл ${filePath} с пустым сообщением коммита`);
                return false;
            }

            const contentBase64 = Buffer.from(content, 'utf-8').toString('base64');

            // Используем прямой HTTP запрос, так как @gitbeaker/rest может неправильно обрабатывать параметры
            const encodedFilePath = encodeURIComponent(filePath);
            const url = `${config.GITLAB_BASE_URL}/api/v4/projects/${projectId}/repository/files/${encodedFilePath}`;

            const requestData = {
                branch: branch,
                content: contentBase64,
                commit_message: commitMessage,
                encoding: 'base64'  // Указываем, что content в base64
            };

            // Добавляем last_commit_id, если он доступен
            if (lastCommitId) {
                requestData.last_commit_id = lastCommitId;
            }

            logger.info(`Обновление файла ${filePath}: branch="${branch}", content length=${contentBase64.length}, commit_message="${commitMessage}", last_commit_id=${lastCommitId || 'не указан'}`);

            const response = await axios.put(url, requestData, {
                headers: {
                    'PRIVATE-TOKEN': config.GITLAB_API_TOKEN,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.data) {
                throw new Error('Пустой ответ от GitLab API');
            }
            return true;
        } catch (error) {
            const errorMessage = error.response
                ? `Status: ${error.response.status}, Message: ${error.response.data?.message || error.message}, Data: ${JSON.stringify(error.response.data)}`
                : error.message;
            logger.error(`Ошибка при обновлении файла ${filePath}: ${errorMessage}`);
            if (error.response) {
                logger.error(`Детали ошибки: ${JSON.stringify(error.response.data, null, 2)}`);
            }
            return false;
        }
    }

    /**
     * Обновление нескольких файлов одним коммитом
     * @param {number} projectId - ID проекта
     * @param {string} branch - Ветка
     * @param {Array<{filePath: string, content: string}>} files - Массив файлов для обновления
     * @param {string} commitMessage - Сообщение коммита
     * @returns {Promise<boolean>} - Успешно ли обновлены файлы
     */
    async updateFiles(projectId, branch, files, commitMessage) {
        try {
            if (!files || files.length === 0) {
                logger.error('Нет файлов для обновления');
                return false;
            }

            if (!commitMessage || commitMessage.trim().length === 0) {
                logger.error('Сообщение коммита пустое');
                return false;
            }

            // Подготавливаем actions для всех файлов
            const actions = [];
            for (const file of files) {
                try {
                    // Получаем текущее содержимое файла для сравнения
                    const currentContent = await this.getFileContent(projectId, file.filePath, branch);

                    logger.info(`Сравнение файла ${file.filePath}: текущая длина=${currentContent?.length || 0}, новая длина=${file.content.length}`);

                    // Проверяем, изменилась ли версия FrontendVersion
                    const versionPattern = /<FrontendVersion>([\s\S]*?)<\/FrontendVersion>/g;
                    const currentVersionMatch = [...(currentContent || '').matchAll(versionPattern)];
                    const newVersionMatch = [...file.content.matchAll(versionPattern)];

                    const currentVersion = currentVersionMatch.length > 0 ? currentVersionMatch[0][1].trim() : null;
                    const newVersion = newVersionMatch.length > 0 ? newVersionMatch[0][1].trim() : null;

                    logger.info(`Файл ${file.filePath}: Текущая версия FrontendVersion: "${currentVersion}", новая версия: "${newVersion}"`);

                    // Нормализуем оба содержимых для сравнения (убираем комментарии для точного сравнения)
                    const normalizedCurrent = (currentContent || '').replace(/[\r\n\s]+$/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
                    const normalizedNew = file.content.replace(/[\r\n\s]+$/, '').replace(/<!--[\s\S]*?-->/g, '').trim();

                    if (normalizedCurrent === normalizedNew) {
                        if (currentVersion === newVersion) {
                            logger.warn(`Файл ${file.filePath} не изменился, версия FrontendVersion уже правильная: "${currentVersion}"`);
                            logger.warn(`Файл ${file.filePath}: Это не должно происходить, так как мы проверяем версии перед добавлением в список. Пропускаем файл.`);
                            continue; // Пропускаем этот файл, так как он не изменился
                        } else {
                            logger.error(`Файл ${file.filePath}: ОШИБКА! Версия должна была измениться с "${currentVersion}" на "${newVersion}", но содержимое идентично!`);
                            // Продолжаем, так как версия должна была измениться
                        }
                    } else {
                        logger.info(`Файл ${file.filePath}: Содержимое изменилось, версия FrontendVersion: "${currentVersion}" -> "${newVersion}"`);
                    }

                    const contentBase64 = Buffer.from(file.content, 'utf-8').toString('base64');

                    const action = {
                        action: 'update',
                        file_path: file.filePath,
                        content: contentBase64,
                        encoding: 'base64'
                    };

                    actions.push(action);
                    logger.info(`Подготовлен action для файла ${file.filePath}, размер content: ${contentBase64.length} байт (${file.content.length} символов)`);
                } catch (error) {
                    logger.error(`Ошибка при подготовке файла ${file.filePath}: ${error.message}`);
                    // Продолжаем с другими файлами
                    const contentBase64 = Buffer.from(file.content, 'utf-8').toString('base64');
                    actions.push({
                        action: 'update',
                        file_path: file.filePath,
                        content: contentBase64,
                        encoding: 'base64'
                    });
                }
            }

            if (actions.length === 0) {
                logger.error('Не удалось подготовить actions для обновления файлов');
                return false;
            }

            // Используем GitLab Commits API для создания коммита с несколькими файлами
            const url = `${config.GITLAB_BASE_URL}/api/v4/projects/${projectId}/repository/commits`;

            const requestData = {
                branch: branch,
                commit_message: commitMessage,
                actions: actions
            };

            logger.info(`Обновление ${files.length} файлов одним коммитом: branch="${branch}", commit_message="${commitMessage}"`);
            logger.info(`Actions для коммита (${actions.length}): ${JSON.stringify(actions.map(a => ({ action: a.action, file_path: a.file_path, has_content: !!a.content, content_length: a.content?.length || 0, encoding: a.encoding })), null, 2)}`);
            logger.info(`Полный requestData: ${JSON.stringify({ ...requestData, actions: requestData.actions.map(a => ({ ...a, content: a.content.substring(0, 100) + '...' })) }, null, 2)}`);

            const response = await axios.post(url, requestData, {
                headers: {
                    'PRIVATE-TOKEN': config.GITLAB_API_TOKEN,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.data) {
                throw new Error('Пустой ответ от GitLab API');
            }

            logger.info(`Коммит успешно создан: ${response.data.id || 'ID не указан'}`);
            logger.info(`Статистика коммита: ${JSON.stringify(response.data.stats || {}, null, 2)}`);
            logger.info(`Изменения в коммите: ${JSON.stringify(response.data.changes || [], null, 2)}`);

            // Проверяем, что коммит содержит изменения
            if (response.data.stats && response.data.stats.total === 0) {
                logger.warn('Коммит создан, но не содержит изменений (stats.total = 0)');
            }

            return true;
        } catch (error) {
            const errorMessage = error.response
                ? `Status: ${error.response.status}, Message: ${error.response.data?.message || error.message}, Data: ${JSON.stringify(error.response.data)}`
                : error.message;
            logger.error(`Ошибка при обновлении файлов: ${errorMessage}`);
            if (error.response) {
                logger.error(`Детали ошибки: ${JSON.stringify(error.response.data, null, 2)}`);
            }
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

    /**
     * Получение содержимого файла с конфликтами из merge request
     * Создает маркеры конфликта, сравнивая содержимое из source и target веток
     * @param {number} projectId - ID проекта
     * @param {string} filePath - Путь к файлу
     * @param {string} sourceBranch - Исходная ветка
     * @param {string} targetBranch - Целевая ветка
     * @returns {Promise<string|null>} - Содержимое файла с маркерами конфликта или null
     */
    async getFileContentWithConflicts(projectId, filePath, sourceBranch, targetBranch) {
        try {
            const [sourceContent, targetContent] = await Promise.all([
                this.getFileContent(projectId, filePath, sourceBranch),
                this.getFileContent(projectId, filePath, targetBranch)
            ]);

            // Если файл отсутствует в одной из веток, конфликта нет
            if (!sourceContent || !targetContent) {
                return null;
            }

            // Если содержимое одинаковое, конфликта нет
            if (sourceContent === targetContent) {
                return null;
            }

            // Создаем маркеры конфликта для всего файла
            // Функция hasOnlyPropertyConflict проверит, что конфликт только в нужном свойстве
            return `<<<<<<< ${filePath}\n${sourceContent}=======\n${targetContent}>>>>>>> ${filePath}`;
        } catch (error) {
            logger.error(`Ошибка при получении содержимого файла с конфликтами ${filePath}: ${error.message}`);
            return null;
        }
    }

    /**
     * Получение лейблов Merge Request с цветами
     * @param {string} mrUrl - URL Merge Request
     * @returns {Promise<Array<{name: string, color: string}>|null>} - Массив объектов с лейблами и цветами или null при ошибке
     */
    async getMergeRequestLabels(mrUrl) {
        try {
            const parsed = parseGitlabMrUrl(mrUrl);

            if (!parsed) {
                logger.warn(`Не удалось распарсить URL MR: ${mrUrl}`);
                return null;
            }

            const project = await this.getProjectByName(parsed.project);
            if (!project) {
                logger.warn(`Проект не найден: ${parsed.project}`);
                return null;
            }

            // Получаем MR
            let mr;
            try {
                mr = await this.client.MergeRequests.show(project.project_id, parsed.mrIid);
            } catch (error) {
                logger.error(`Ошибка при получении MR ${parsed.mrIid}: ${error.message}`);
                if (error.stack) {
                    logger.error(`Stack trace: ${error.stack}`);
                }
                return null;
            }

            if (!mr) {
                logger.warn(`MR не найден: ${parsed.mrIid}`);
                return null;
            }

            const mrLabelNames = mr.labels || [];

            if (mrLabelNames.length === 0) {
                return [];
            }

            // Получаем все лейблы проекта через ProjectLabels API
            let projectLabels = [];
            try {
                const labelsResult = await this.client.ProjectLabels.all(project.project_id);
                projectLabels = Array.isArray(labelsResult) ? labelsResult : [];
            } catch (error) {
                logger.warn(`Не удалось получить лейблы проекта ${project.project_id}: ${error.message}`);
                if (error.stack) {
                    logger.warn(`Stack trace: ${error.stack}`);
                }
                // Продолжаем работу с дефолтными цветами
                projectLabels = [];
            }

            // Создаем мапу лейблов проекта для быстрого поиска по имени
            const labelsMap = new Map();
            projectLabels.forEach(label => {
                labelsMap.set(label.name, {
                    name: label.name,
                    color: label.color || '#428BCA' // Дефолтный цвет, если не указан
                });
            });

            // Формируем результат с цветами
            const labelsWithColors = mrLabelNames.map(labelName => {
                const labelInfo = labelsMap.get(labelName);
                if (labelInfo) {
                    return labelInfo;
                }
                // Если лейбл не найден в проекте, возвращаем с дефолтным цветом
                return {
                    name: labelName,
                    color: '#428BCA'
                };
            });

            return labelsWithColors;
        } catch (error) {
            logger.error(`Ошибка при получении лейблов MR ${mrUrl}: ${error.message}`);
            if (error.stack) {
                logger.error(`Stack trace: ${error.stack}`);
            }
            return null;
        }
    }

    /**
     * Обновление лейблов Merge Request
     * @param {string} mrUrl - URL Merge Request
     * @param {Array<string>} labels - Массив названий лейблов для установки
     * @returns {Promise<boolean>} - Успешно ли обновлены лейблы
     */
    async updateMergeRequestLabels(mrUrl, labels) {
        try {
            const parsed = parseGitlabMrUrl(mrUrl);

            if (!parsed) {
                logger.warn(`Не удалось распарсить URL MR: ${mrUrl}`);
                return false;
            }

            const project = await this.getProjectByName(parsed.project);
            if (!project) {
                logger.warn(`Проект не найден: ${parsed.project}`);
                return false;
            }

            // Обновляем лейблы через edit метод
            await this.client.MergeRequests.edit(project.project_id, parsed.mrIid, {
                labels: labels || []
            });

            logger.info(`Лейблы MR ${mrUrl} успешно обновлены: ${labels?.join(', ') || 'нет лейблов'}`);
            return true;
        } catch (error) {
            logger.error(`Ошибка при обновлении лейблов MR ${mrUrl}: ${error.message}`);
            return false;
        }
    }
}

module.exports = new GitlabService();
module.exports.STATUSES = STATUSES;
module.exports.FINAL_STATUSES = FINAL_STATUSES;
