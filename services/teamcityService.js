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
                    fields: 'id,number,status,state,statusText,startDate,finishDate,href,webUrl,buildType(id,name,projectName),statistics(property(name,value)),testOccurrences(count,failed,passed,ignored,muted)'
                }
            });

            const build = response.data;

            // Получаем статистику тестов, передавая buildId для запроса к /statistics endpoint
            const testStats = await this.getBuildTestStatistics(
                buildId,
                build.statusText,
                build.statistics?.property || [],
                build.testOccurrences
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
     * @param {Object} testOccurrences - Объект testOccurrences из API с атрибутами count, failed, passed, ignored, muted
     * @returns {Promise<Object>}
     */
    async getBuildTestStatistics(buildId, statusText, statistics = [], testOccurrences = null) {
        try {
            // Сначала пытаемся получить статистику из переданного testOccurrences (если есть)
            if (testOccurrences) {
                // TeamCity API может возвращать testOccurrences как объект с атрибутами или как строку
                // Пытаемся извлечь значения разными способами
                let total, passed, failed, ignored, muted;

                if (typeof testOccurrences === 'object') {
                    // Если это объект, берем значения напрямую
                    total = testOccurrences.count !== undefined ? parseInt(testOccurrences.count, 10) : undefined;
                    passed = testOccurrences.passed !== undefined ? parseInt(testOccurrences.passed, 10) : undefined;
                    failed = testOccurrences.failed !== undefined ? parseInt(testOccurrences.failed, 10) : undefined;
                    ignored = testOccurrences.ignored !== undefined ? parseInt(testOccurrences.ignored, 10) : undefined;
                    muted = testOccurrences.muted !== undefined ? parseInt(testOccurrences.muted, 10) : undefined;
                }

                // Если есть хотя бы одно значение, используем их
                if (total !== undefined || passed !== undefined || failed !== undefined || ignored !== undefined || muted !== undefined) {
                    return {
                        total: total !== undefined ? total : ((passed || 0) + (failed || 0) + (ignored || 0) + (muted || 0)),
                        passed: passed || 0,
                        failed: failed || 0,
                        muted: muted || 0,
                        ignored: ignored || 0
                    };
                }
            }

            // Затем пытаемся получить статистику из переданного statistics property билда
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
                    total: statsMap['TotalTestCount'] || ((statsMap['PassedTestCount'] || 0) + (statsMap['FailedTestCount'] || 0) + (statsMap['IgnoredTestCount'] || 0) + (statsMap['MutedTestCount'] || 0)),
                    passed: statsMap['PassedTestCount'] || 0,
                    failed: statsMap['FailedTestCount'] || 0,
                    muted: statsMap['MutedTestCount'] || 0,
                    ignored: statsMap['IgnoredTestCount'] || 0
                };
            }

            // Затем пытаемся получить статистику из /statistics endpoint (если не было переданных данных)
            try {
                const statsFromEndpoint = await this._getBuildStatisticsFromEndpoint(buildId);
                if (statsFromEndpoint) {
                    return statsFromEndpoint;
                }
            } catch (error) {
                logger.debug(`[TeamCityService] Не удалось получить статистику из /statistics endpoint для билда ${buildId}: ${error.message}`);
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
     * Получить статистику тестов из /statistics endpoint
     * @param {string|number} buildId - ID билда
     * @returns {Promise<Object|null>}
     */
    async _getBuildStatisticsFromEndpoint(buildId) {
        try {
            const url = `${this.baseUrl}/app/rest/builds/id:${buildId}/statistics`;
            const response = await axios.get(url, {
                headers: this._getAuthHeaders()
            });

            if (!response.data || !response.data.property) {
                return null;
            }

            const properties = Array.isArray(response.data.property)
                ? response.data.property
                : [response.data.property];

            const statsMap = {};
            for (const prop of properties) {
                if (prop.name && prop.value !== undefined) {
                    statsMap[prop.name] = parseInt(prop.value, 10) || 0;
                }
            }

            // Проверяем наличие нужных полей
            if (statsMap['PassedTestCount'] !== undefined || statsMap['FailedTestCount'] !== undefined || statsMap['TotalTestCount'] !== undefined) {
                return {
                    total: statsMap['TotalTestCount'] || 0,
                    passed: statsMap['PassedTestCount'] || 0,
                    failed: statsMap['FailedTestCount'] || 0,
                    muted: statsMap['MutedTestCount'] || 0,
                    ignored: statsMap['IgnoredTestCount'] || 0
                };
            }

            return null;
        } catch (error) {
            logger.debug(`[TeamCityService] Ошибка при получении статистики из /statistics endpoint для билда ${buildId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Парсить статистику тестов из statusText билда
     * Формат: "Tests failed: 4, passed: 775, ignored: 1, muted: 13"
     * Или: "Tests failed: 7 (3 new), passed: 766, ignored: 1, muted: 19"
     * @param {string} statusText
     * @returns {Object|null}
     */
    _parseTestStatisticsFromStatusText(statusText) {
        if (!statusText) {
            return null;
        }

        // Ищем паттерн "Tests failed: X (Y new), passed: Z, ignored: W, muted: V"
        // Учитываем возможные дополнительные части в скобках после failed
        const testPattern = /Tests\s+failed:\s*(\d+)(?:\s*\([^)]+\))?[,\s]+passed:\s*(\d+)(?:[,\s]+ignored:\s*(\d+))?(?:[,\s]+muted:\s*(\d+))?/i;
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

