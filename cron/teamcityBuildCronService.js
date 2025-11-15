const BaseCronService = require('./baseCronService');
const { getAllNotifications, updateLastChecked, updatePostId } = require('../db/models/teamcityBuildNotifications');
const TeamCityService = require('../services/teamcityService');
const { postMessage } = require('../mattermost/utils');
const moment = require('moment-timezone');
const logger = require('../logger');

class TeamCityBuildCronService extends BaseCronService {
    constructor() {
        super('TeamCityBuildCron');
        this.schedule = '*/5 * * * *';
        this.teamcity = TeamCityService;
    }

    async loadJobsFromDb() {
        this.createJob('teamcity_build_polling', this.schedule, async () => {
            try {
                const allNotifications = await getAllNotifications();
                // Фильтруем только активные настройки
                const notifications = allNotifications.filter(n => n.is_enabled === 1 || n.is_enabled === true);

                if (!notifications || notifications.length === 0) {
                    return;
                }

                logger.debug(`[TeamCityBuildCron] Проверяем ${notifications.length} активных настроек уведомлений`);

                for (const notification of notifications) {
                    try {
                        await this._checkBuildStatus(notification);
                    } catch (error) {
                        logger.error(`[TeamCityBuildCron] Ошибка при проверке билда для настройки ${notification.id}: ${error.message}`);
                    }
                }
            } catch (error) {
                logger.error(`[TeamCityBuildCron] Ошибка при загрузке настроек: ${error.message}`);
            }
        });
    }

    /**
     * Проверить статус билда и отправить уведомление при необходимости
     * @param {Object} notification - Настройка уведомления
     */
    async _checkBuildStatus(notification) {
        const { id, build_config_id, channel_id, notify_on, last_build_id } = notification;

        try {
            // Получаем последний билд
            const latestBuild = await this.teamcity.getLatestBuild(build_config_id);
            if (!latestBuild) {
                logger.warn(`[TeamCityBuildCron] Не найден последний билд для ${build_config_id}`);
                return;
            }

            // Проверяем, завершен ли билд
            if (!this.teamcity.isFinished(latestBuild.state)) {
                logger.debug(`[TeamCityBuildCron] Билд ${latestBuild.id} еще не завершен (${latestBuild.state})`);
                return;
            }

            // Проверяем, новый ли это билд
            if (last_build_id && String(last_build_id) === String(latestBuild.id)) {
                logger.debug(`[TeamCityBuildCron] Билд ${latestBuild.id} уже был обработан`);
                return;
            }

            // Проверяем, нужно ли отправлять уведомление в зависимости от настроек
            const shouldNotify = this._shouldNotify(latestBuild.status, notify_on);
            if (!shouldNotify) {
                logger.debug(`[TeamCityBuildCron] Пропускаем уведомление для билда ${latestBuild.id} (статус: ${latestBuild.status}, настройка: ${notify_on})`);
                // Все равно обновляем last_build_id, чтобы не проверять этот билд снова
                await updateLastChecked(id, latestBuild.id);
                return;
            }

            // Отправляем уведомление
            await this._sendNotification(notification, latestBuild);

            // Обновляем информацию о последней проверке
            await updateLastChecked(id, latestBuild.id);

            logger.debug(`[TeamCityBuildCron] Отправлено уведомление о билде ${latestBuild.id} в канал ${channel_id}`);
        } catch (error) {
            logger.error(`[TeamCityBuildCron] Ошибка при проверке статуса билда для ${build_config_id}: ${error.message}`);
        }
    }

    /**
     * Определить, нужно ли отправлять уведомление
     * @param {string} status - Статус билда
     * @param {string} notifyOn - Настройка уведомлений (all, success, failure)
     * @returns {boolean}
     */
    _shouldNotify(status, notifyOn) {
        if (notifyOn === 'all') {
            return true;
        }
        if (notifyOn === 'success' && this.teamcity.isSuccessStatus(status)) {
            return true;
        }
        if (notifyOn === 'failure' && this.teamcity.isFailureStatus(status)) {
            return true;
        }
        return false;
    }

    /**
     * Отправить уведомление в Mattermost
     * @param {Object} notification - Настройка уведомления
     * @param {Object} build - Информация о билде
     */
    async _sendNotification(notification, build) {
        const { id, channel_id, build_config_name } = notification;
        const message = this._formatBuildMessage(build, build_config_name);

        try {
            const post = await postMessage(channel_id, message);
            if (post && post.id) {
                // Сохраняем post_id для возможности дальнейшей работы с тредом
                await updatePostId(id, post.id);
                logger.debug(`[TeamCityBuildCron] Сохранен post_id ${post.id} для настройки ${id}`);
            }
        } catch (error) {
            logger.error(`[TeamCityBuildCron] Ошибка при отправке сообщения в канал ${channel_id}: ${error.message}`);
        }
    }

    /**
     * Форматировать сообщение о билде
     * @param {Object} build - Информация о билде
     * @param {string} buildConfigName - Название конфигурации билда
     * @returns {string}
     */
    _formatBuildMessage(build, buildConfigName) {
        const statusEmoji = this._getStatusEmoji(build.status);
        const statusText = this._getStatusText(build.status);

        const lines = [];
        lines.push(`${statusEmoji} **${buildConfigName || build.buildType?.name || 'Билд'}** - ${statusText}`);
        lines.push('');
        lines.push(`**Билд:** [#${build.number}](${build.webUrl})`);
        lines.push(`**Статус:** ${build.statusText || build.status}`);

        if (build.finishDate) {
            // Парсим дату из TeamCity и форматируем в UTC
            // moment.utc автоматически обрабатывает ISO строки и timestamps
            const finishDate = moment.utc(build.finishDate);
            if (finishDate.isValid()) {
                lines.push(`**Завершен:** ${finishDate.format('YYYY-MM-DD HH:mm:ss')} UTC`);
            }
        }

        // Добавляем статистику тестов, если доступна
        if (build.testStatistics && build.testStatistics.total > 0) {
            lines.push('');
            lines.push('**Статистика тестов:**');
            lines.push(`- Прошло: ${build.testStatistics.passed}`);
            lines.push(`- Упало: ${build.testStatistics.failed}`);
            if (build.testStatistics.ignored > 0) {
                lines.push(`- Игнорировано: ${build.testStatistics.ignored}`);
            }
            if (build.testStatistics.muted > 0) {
                lines.push(`- Замьючено: ${build.testStatistics.muted}`);
            }
            lines.push(`- Всего: ${build.testStatistics.total}`);
        }

        return lines.join('\n');
    }

    /**
     * Получить эмодзи для статуса
     * @param {string} status
     * @returns {string}
     */
    _getStatusEmoji(status) {
        if (this.teamcity.isSuccessStatus(status)) {
            return ':heavy_check_mark:';
        }
        if (this.teamcity.isFailureStatus(status)) {
            return ':heavy_multiplication_x:';
        }
        return '';
    }

    /**
     * Получить текстовое описание статуса
     * @param {string} status
     * @returns {string}
     */
    _getStatusText(status) {
        if (this.teamcity.isSuccessStatus(status)) {
            return 'Успешно';
        }
        if (this.teamcity.isFailureStatus(status)) {
            return 'Неуспешно';
        }
        return status;
    }
}

module.exports = TeamCityBuildCronService;

