const JiraService = require('./jiraService');
const { postMessage, getChannel } = require('../mattermost/utils');
const logger = require('../logger');
const { PATCH_CHANNEL_NAME } = require('../config');

class PatchService {
    constructor() {
        this.channelName = PATCH_CHANNEL_NAME;
        this.channelId = null; // Будет получен при первом использовании
    }

    /**
     * Получает ID канала по имени
     */
    async _getChannelId() {
        if (this.channelId) {
            return this.channelId;
        }

        try {
            const channel = await getChannel(null, this.channelName);
            if (channel && channel.id) {
                this.channelId = channel.id;
                return this.channelId;
            }
            throw new Error(`Канал ${this.channelName} не найден`);
        } catch (error) {
            logger.error(`Ошибка получения канала ${this.channelName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Обрабатывает создание сообщения о патче
     * @param {Object} data - Данные о патче
     * @param {string} data.taskId - ID задачи патча (например, CASEM-92133)
     * @param {string} data.backVersion - Версия Back-End сборки
     * @param {string} data.frontVersion - Версия Front-End сборки
     * @param {string} data.buildMessageLink - Ссылка на сообщение с деталями сборки
     * @param {Array<string>} data.subtasks - Список подзадач (можно дополнить)
     * @param {string} data.comment - Опциональный комментарий
     * @returns {Promise<Object>} - Результат обработки
     */
    async handlePatchMessage(data) {
        try {
            this._validateData(data);

            // Получаем данные задачи из Jira
            const task = await JiraService.fetchTask(data.taskId);
            if (!task) {
                throw new Error(`Задача ${data.taskId} не найдена`);
            }

            // Получаем зависимости ("Зависит от")
            let dependencies = [];

            // Если зависимости переданы в форме, используем их
            if (data.subtasks && data.subtasks.length > 0) {
                // Преобразуем массив строк в массив объектов
                for (const depKey of data.subtasks) {
                    if (depKey && depKey.trim()) {
                        try {
                            // Пытаемся получить информацию о зависимости
                            const dep = await JiraService.fetchTask(depKey.trim());
                            if (dep) {
                                dependencies.push({
                                    key: dep.key,
                                    summary: dep.summary || ''
                                });
                            } else {
                                // Если не удалось получить, добавляем только ключ
                                dependencies.push({
                                    key: depKey.trim(),
                                    summary: ''
                                });
                            }
                        } catch (error) {
                            // Если ошибка, добавляем только ключ
                            dependencies.push({
                                key: depKey.trim(),
                                summary: ''
                            });
                        }
                    }
                }
            }

            // Если зависимости не указаны, получаем их из главной задачи
            if (dependencies.length === 0) {
                // Зависимости уже есть в объекте task, так как они извлекаются в getTask
                dependencies = (task.dependencies || []).map(dep => ({
                    key: dep.key,
                    summary: dep.summary || ''
                }));
            }

            // Извлекаем версии сборки из описания, если не указаны
            const versions = this._extractBuildVersions(task.description || '', data);

            // Получаем fix versions
            const fixVersions = task.fixVersions || [];
            const fixVersion = fixVersions.length > 0 ? fixVersions[0].name : 'не указана';

            // Формируем сообщение
            const message = this._buildPatchMessage({
                taskId: data.taskId,
                taskName: task.summary,
                fixVersion,
                backVersion: versions.back || data.backVersion || 'не указана',
                frontVersion: versions.front || data.frontVersion || 'не указана',
                buildMessageLink: data.buildMessageLink,
                dependencies,
                comment: data.comment
            });

            // Получаем ID канала и отправляем сообщение
            const channelId = await this._getChannelId();
            const post = await postMessage(channelId, message);

            return { status: 'success', postId: post.id };
        } catch (err) {
            logger.error(`Ошибка обработки патча: ${err.message}`, err);
            return { status: 'error', error: err.message };
        }
    }

    /**
     * Извлекает версии сборки из описания задачи
     * @param {string} description - Описание задачи
     * @param {Object} data - Данные, переданные пользователем
     * @returns {Object} - Объект с back и front версиями
     */
    _extractBuildVersions(description, data) {
        const versions = {
            back: data.backVersion || null,
            front: data.frontVersion || null
        };

        if (!description) {
            return versions;
        }

        // Паттерны для поиска версий в описании
        // Back-End: 75.11.334 или Back-End: 75.11.334
        const backPattern = /(?:Back-End|Backend|Back)[\s:]*(\d+\.\d+\.\d+)/i;
        const frontPattern = /(?:Front-End|Frontend|Front)[\s:]*(\d+\.\d+\.\d+)/i;

        if (!versions.back) {
            const backMatch = description.match(backPattern);
            if (backMatch) {
                versions.back = backMatch[1];
            }
        }

        if (!versions.front) {
            const frontMatch = description.match(frontPattern);
            if (frontMatch) {
                versions.front = frontMatch[1];
            }
        }

        return versions;
    }

    /**
     * Формирует сообщение о патче
     */
    _buildPatchMessage(data) {
        const {
            taskId,
            taskName,
            fixVersion,
            backVersion,
            frontVersion,
            buildMessageLink,
            dependencies,
            comment
        } = data;

        const jiraLink = (id) => `https://jira.parcsis.org/browse/${encodeURIComponent(id)}`;

        const lines = [];
        lines.push('@channel');
        lines.push(`Мы подготовили патч версии ${fixVersion}`);
        lines.push('');
        lines.push('Версия сборки:');
        lines.push(`Back-End: ${backVersion}`);
        lines.push(`Front-End: ${frontVersion}`);
        lines.push('');
        lines.push(`Патч подготовлен в рамках задачи [${taskId}](${jiraLink(taskId)})`);

        if (buildMessageLink) {
            lines.push(`[Подробности по сборке](${buildMessageLink})`);
        }

        lines.push('');
        lines.push('В патч вошли задачи:');

        if (dependencies && dependencies.length > 0) {
            dependencies.forEach(dep => {
                const key = dep.key || dep;
                const summary = dep.summary || (typeof dep === 'string' ? '' : '');
                if (summary) {
                    lines.push(`- [${key}](${jiraLink(key)}) - ${summary}`);
                } else {
                    lines.push(`- [${key}](${jiraLink(key)})`);
                }
            });
        } else {
            lines.push('_не указано_');
        }

        if (comment) {
            lines.push('');
            lines.push(comment);
        }

        return lines.join('\n');
    }

    /**
     * Валидация данных
     */
    _validateData(data) {
        if (!data.taskId) {
            throw new Error('Отсутствует taskId');
        }
    }
}

module.exports = new PatchService();
