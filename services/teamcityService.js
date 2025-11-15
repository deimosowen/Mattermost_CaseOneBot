const axios = require('axios');
const { TEAMCITY_BASE_URL, TEAMCITY_USERNAME, TEAMCITY_PASSWORD } = require('../config');
const logger = require('../logger');

class TeamCityService {
    constructor() {
        this.baseUrl = TEAMCITY_BASE_URL;
        this.username = TEAMCITY_USERNAME;
        this.password = TEAMCITY_PASSWORD;
    }

    /**
     * Получить базовые заголовки для аутентификации
     * @returns {Object}
     */
    _getAuthHeaders() {
        if (!this.username || !this.password) {
            throw new Error('TeamCity credentials not configured');
        }
        const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        return {
            'Authorization': `Basic ${credentials}`,
            'Accept': 'application/json'
        };
    }

    /**
     * Получить информацию о последнем билде конфигурации
     * @param {string} buildConfigId - ID конфигурации билда (например, CaseProAutotest_Pipeline_DailyRun_NightlyBuilds)
     * @returns {Promise<Object|null>}
     */
    async getLatestBuild(buildConfigId) {
        try {
            const url = `${this.baseUrl}/app/rest/builds?locator=buildType:${buildConfigId},count:1`;
            const response = await axios.get(url, {
                headers: this._getAuthHeaders()
            });

            if (!response.data || !response.data.build || response.data.build.length === 0) {
                return null;
            }

            const build = response.data.build[0];
            return await this.getBuildDetails(build.id);
        } catch (error) {
            logger.error(`[TeamCityService] Ошибка при получении последнего билда ${buildConfigId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Получить детальную информацию о билде
     * @param {string|number} buildId - ID билда
     * @returns {Promise<Object>}
     */
    async getBuildDetails(buildId) {
        try {
            const url = `${this.baseUrl}/app/rest/builds/id:${buildId}`;
            const response = await axios.get(url, {
                headers: this._getAuthHeaders(),
                params: {
                    fields: 'id,number,status,state,statusText,startDate,finishDate,href,webUrl,buildType(id,name,projectName),statistics(property(name,value))'
                }
            });

            const build = response.data;
            
            // Получаем статистику тестов, передавая statusText и statistics
            const testStats = await this.getBuildTestStatistics(
                buildId,
                build.statusText,
                build.statistics?.property || []
            );

            return {
                id: build.id,
                number: build.number,
                status: build.status, // SUCCESS, FAILURE, ERROR, etc.
                state: build.state, // finished, running, queued
                statusText: build.statusText,
                startDate: build.startDate,
                finishDate: build.finishDate,
                href: build.href,
                webUrl: build.webUrl,
                buildType: {
                    id: build.buildType?.id,
                    name: build.buildType?.name,
                    projectName: build.buildType?.projectName
                },
                testStatistics: testStats
            };
        } catch (error) {
            logger.error(`[TeamCityService] Ошибка при получении деталей билда ${buildId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Получить статистику тестов для билда
     * @param {string|number} buildId - ID билда
     * @param {string} statusText - Текст статуса билда (содержит статистику тестов)
     * @param {Array} statistics - Статистика билда из API
     * @returns {Promise<Object>}
     */
    async getBuildTestStatistics(buildId, statusText, statistics = []) {
        try {
            // Сначала пытаемся получить статистику из statistics property билда
            const statsMap = {};
            if (statistics && Array.isArray(statistics)) {
                for (const stat of statistics) {
                    if (stat.property) {
                        const props = Array.isArray(stat.property) ? stat.property : [stat.property];
                        for (const prop of props) {
                            if (prop.name && prop.value) {
                                statsMap[prop.name] = parseInt(prop.value, 10) || 0;
                            }
                        }
                    }
                }
            }

            // Если есть статистика из properties, используем её
            if (statsMap['PassedTestCount'] !== undefined || statsMap['FailedTestCount'] !== undefined) {
                return {
                    total: (statsMap['PassedTestCount'] || 0) + (statsMap['FailedTestCount'] || 0) + (statsMap['IgnoredTestCount'] || 0) + (statsMap['MutedTestCount'] || 0),
                    passed: statsMap['PassedTestCount'] || 0,
                    failed: statsMap['FailedTestCount'] || 0,
                    muted: statsMap['MutedTestCount'] || 0,
                    ignored: statsMap['IgnoredTestCount'] || 0
                };
            }

            // Если нет статистики в properties, парсим из statusText
            if (statusText) {
                const parsed = this._parseTestStatisticsFromStatusText(statusText);
                if (parsed && parsed.total > 0) {
                    return parsed;
                }
            }

            // Если ничего не получилось, пытаемся получить через testOccurrences API
            // Но с учетом пагинации - получаем count сначала
            const baseUrl = `${this.baseUrl}/app/rest/testOccurrences`;
            const response = await axios.get(baseUrl, {
                headers: this._getAuthHeaders(),
                params: {
                    fields: 'count',
                    locator: `build:(id:${buildId})`
                }
            });

            const totalCount = response.data.count || 0;
            
            // Если тестов много, получаем статистику по статусам через locator
            if (totalCount > 0) {
                const passedResponse = await axios.get(baseUrl, {
                    headers: this._getAuthHeaders(),
                    params: {
                        fields: 'count',
                        locator: `build:(id:${buildId}),status:SUCCESS`
                    }
                });

                const failedResponse = await axios.get(baseUrl, {
                    headers: this._getAuthHeaders(),
                    params: {
                        fields: 'count',
                        locator: `build:(id:${buildId}),status:FAILURE`
                    }
                });

                const mutedResponse = await axios.get(baseUrl, {
                    headers: this._getAuthHeaders(),
                    params: {
                        fields: 'count',
                        locator: `build:(id:${buildId}),muted:true`
                    }
                });

                const passed = passedResponse.data.count || 0;
                const failed = failedResponse.data.count || 0;
                const muted = mutedResponse.data.count || 0;

                return {
                    total: totalCount,
                    passed,
                    failed,
                    muted,
                    ignored: 0
                };
            }

            return {
                total: 0,
                passed: 0,
                failed: 0,
                muted: 0,
                ignored: 0
            };
        } catch (error) {
            logger.warn(`[TeamCityService] Не удалось получить статистику тестов для билда ${buildId}: ${error.message}`);
            
            // Пытаемся парсить из statusText как fallback
            if (statusText) {
                const parsed = this._parseTestStatisticsFromStatusText(statusText);
                if (parsed && parsed.total > 0) {
                    return parsed;
                }
            }

            // Возвращаем пустую статистику, если не удалось получить
            return {
                total: 0,
                passed: 0,
                failed: 0,
                muted: 0,
                ignored: 0
            };
        }
    }

    /**
     * Парсить статистику тестов из statusText билда
     * Формат: "Tests failed: 4, passed: 775, ignored: 1, muted: 13"
     * @param {string} statusText
     * @returns {Object|null}
     */
    _parseTestStatisticsFromStatusText(statusText) {
        if (!statusText) {
            return null;
        }

        // Ищем паттерн "Tests failed: X, passed: Y, ignored: Z, muted: W"
        const testPattern = /Tests\s+failed:\s*(\d+)[,\s]+passed:\s*(\d+)(?:[,\s]+ignored:\s*(\d+))?(?:[,\s]+muted:\s*(\d+))?/i;
        const match = statusText.match(testPattern);

        if (match) {
            const failed = parseInt(match[1], 10) || 0;
            const passed = parseInt(match[2], 10) || 0;
            const ignored = parseInt(match[3], 10) || 0;
            const muted = parseInt(match[4], 10) || 0;
            const total = passed + failed + ignored + muted;

            return {
                total,
                passed,
                failed,
                muted,
                ignored
            };
        }

        return null;
    }

    /**
     * Получить информацию о конфигурации билда
     * @param {string} buildConfigId - ID конфигурации билда
     * @returns {Promise<Object|null>}
     */
    async getBuildConfig(buildConfigId) {
        try {
            const url = `${this.baseUrl}/app/rest/buildTypes/id:${buildConfigId}`;
            const response = await axios.get(url, {
                headers: this._getAuthHeaders(),
                params: {
                    fields: 'id,name,project(id,name)'
                }
            });

            return response.data;
        } catch (error) {
            logger.error(`[TeamCityService] Ошибка при получении конфигурации билда ${buildConfigId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Проверить, является ли статус успешным
     * @param {string} status
     * @returns {boolean}
     */
    isSuccessStatus(status) {
        return status === 'SUCCESS';
    }

    /**
     * Проверить, является ли статус неуспешным
     * @param {string} status
     * @returns {boolean}
     */
    isFailureStatus(status) {
        return status === 'FAILURE' || status === 'ERROR';
    }

    /**
     * Проверить, завершен ли билд
     * @param {string} state
     * @returns {boolean}
     */
    isFinished(state) {
        return state === 'finished';
    }
}

module.exports = new TeamCityService();

