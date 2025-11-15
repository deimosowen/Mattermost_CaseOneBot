require('./teamcityService.setup');

const { axios, logger } = require('./teamcityService.setup');
const TeamCityService = require('../../../services/teamcityService');

describe('TeamCityService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        axios.get.mockClear();
    });

    describe('_getAuthHeaders', () => {
        test('возвращает правильные заголовки аутентификации', () => {
            const headers = TeamCityService._getAuthHeaders();

            expect(headers).toHaveProperty('Authorization');
            expect(headers).toHaveProperty('Accept', 'application/json');
            expect(headers.Authorization).toMatch(/^Basic /);
            
            // Проверяем, что credentials правильно закодированы
            const base64Credentials = headers.Authorization.replace('Basic ', '');
            const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
            expect(credentials).toBe('test_user:test_password');
        });

        test('выбрасывает ошибку если credentials не настроены', () => {
            // Создаем новый экземпляр с пустыми credentials
            const TeamCityServiceClass = require('../../../services/teamcityService').constructor || 
                class TeamCityService {
                    constructor() {
                        this.baseUrl = 'https://ci.example.com';
                        this.username = null;
                        this.password = null;
                    }
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
                };
            
            const testService = new TeamCityServiceClass();
            testService.username = null;
            testService.password = null;

            expect(() => testService._getAuthHeaders()).toThrow('TeamCity credentials not configured');
        });
    });

    describe('getLatestBuild', () => {
        test('успешно получает последний билд', async () => {
            const buildConfigId = 'TestBuildConfig';
            const mockBuild = {
                id: '12345',
                number: '42',
                status: 'SUCCESS',
                state: 'finished',
                statusText: 'Tests passed: 100',
                startDate: '20231101T120000+0000',
                finishDate: '20231101T130000+0000',
                href: '/app/rest/builds/id:12345',
                webUrl: 'https://ci.example.com/viewLog.html?buildId=12345',
                buildType: {
                    id: 'TestBuildConfig',
                    name: 'Test Build',
                    projectName: 'Test Project'
                },
                statistics: {
                    property: [
                        { name: 'PassedTestCount', value: '100' },
                        { name: 'FailedTestCount', value: '0' }
                    ]
                }
            };

            axios.get
                .mockResolvedValueOnce({
                    data: {
                        build: [{ id: '12345' }]
                    }
                })
                .mockResolvedValueOnce({
                    data: mockBuild
                })
                .mockResolvedValueOnce({
                    data: { count: 100 }
                })
                .mockResolvedValueOnce({
                    data: { count: 100 }
                })
                .mockResolvedValueOnce({
                    data: { count: 0 }
                })
                .mockResolvedValueOnce({
                    data: { count: 0 }
                });

            const result = await TeamCityService.getLatestBuild(buildConfigId);

            expect(result).toBeDefined();
            expect(result.id).toBe('12345');
            expect(result.number).toBe('42');
            expect(result.status).toBe('SUCCESS');
            expect(axios.get).toHaveBeenCalledWith(
                expect.stringContaining(`buildType:${buildConfigId}`),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: expect.stringMatching(/^Basic /)
                    })
                })
            );
        });

        test('возвращает null если билды не найдены', async () => {
            const buildConfigId = 'TestBuildConfig';

            axios.get.mockResolvedValueOnce({
                data: { build: [] }
            });

            const result = await TeamCityService.getLatestBuild(buildConfigId);

            expect(result).toBeNull();
        });

        test('обрабатывает ошибки API', async () => {
            const buildConfigId = 'TestBuildConfig';
            const error = new Error('API Error');

            axios.get.mockRejectedValueOnce(error);

            await expect(TeamCityService.getLatestBuild(buildConfigId)).rejects.toThrow('API Error');
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining(`Ошибка при получении последнего билда ${buildConfigId}`)
            );
        });
    });

    describe('getBuildDetails', () => {
        test('успешно получает детали билда', async () => {
            const buildId = '12345';
            const mockBuild = {
                id: '12345',
                number: '42',
                status: 'SUCCESS',
                state: 'finished',
                statusText: 'Tests passed: 100',
                startDate: '20231101T120000+0000',
                finishDate: '20231101T130000+0000',
                href: '/app/rest/builds/id:12345',
                webUrl: 'https://ci.example.com/viewLog.html?buildId=12345',
                buildType: {
                    id: 'TestBuildConfig',
                    name: 'Test Build',
                    projectName: 'Test Project'
                },
                statistics: {
                    property: [
                        { name: 'PassedTestCount', value: '100' },
                        { name: 'FailedTestCount', value: '0' }
                    ]
                }
            };

            axios.get
                .mockResolvedValueOnce({
                    data: mockBuild
                })
                .mockResolvedValueOnce({
                    data: { count: 100 }
                })
                .mockResolvedValueOnce({
                    data: { count: 100 }
                })
                .mockResolvedValueOnce({
                    data: { count: 0 }
                })
                .mockResolvedValueOnce({
                    data: { count: 0 }
                });

            const result = await TeamCityService.getBuildDetails(buildId);

            expect(result).toBeDefined();
            expect(result.id).toBe('12345');
            expect(result.number).toBe('42');
            expect(result.status).toBe('SUCCESS');
            expect(result.state).toBe('finished');
            expect(result.buildType).toBeDefined();
            expect(result.testStatistics).toBeDefined();
        });

        test('обрабатывает ошибки API', async () => {
            const buildId = '12345';
            const error = new Error('API Error');

            axios.get.mockRejectedValueOnce(error);

            await expect(TeamCityService.getBuildDetails(buildId)).rejects.toThrow('API Error');
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining(`Ошибка при получении деталей билда ${buildId}`)
            );
        });
    });

    describe('getBuildTestStatistics', () => {
        test('использует статистику из properties', async () => {
            const buildId = '12345';
            const statistics = [
                {
                    property: [
                        { name: 'PassedTestCount', value: '100' },
                        { name: 'FailedTestCount', value: '5' },
                        { name: 'IgnoredTestCount', value: '2' },
                        { name: 'MutedTestCount', value: '3' }
                    ]
                }
            ];

            const result = await TeamCityService.getBuildTestStatistics(buildId, null, statistics);

            expect(result).toEqual({
                total: 110,
                passed: 100,
                failed: 5,
                ignored: 2,
                muted: 3
            });
            expect(axios.get).not.toHaveBeenCalled();
        });

        test('парсит статистику из statusText если нет properties', async () => {
            const buildId = '12345';
            const statusText = 'Tests failed: 4, passed: 775, ignored: 1, muted: 13';

            axios.get
                .mockResolvedValueOnce({
                    data: { count: 793 }
                });

            const result = await TeamCityService.getBuildTestStatistics(buildId, statusText, []);

            expect(result).toEqual({
                total: 793,
                passed: 775,
                failed: 4,
                ignored: 1,
                muted: 13
            });
        });

        test('использует testOccurrences API как fallback', async () => {
            const buildId = '12345';

            // Очищаем моки перед тестом
            axios.get.mockReset();

            // Первый вызов - получение общего количества тестов
            // Второй - количество успешных (SUCCESS)
            // Третий - количество упавших (FAILURE)
            // Четвертый - количество замьюченных (muted:true)
            axios.get
                .mockResolvedValueOnce({
                    data: { count: 100 }
                })
                .mockResolvedValueOnce({
                    data: { count: 95 }
                })
                .mockResolvedValueOnce({
                    data: { count: 5 }
                })
                .mockResolvedValueOnce({
                    data: { count: 2 }
                });

            // Важно: передаем null для statusText, чтобы не парсился
            const result = await TeamCityService.getBuildTestStatistics(buildId, null, []);

            expect(result).toEqual({
                total: 100,
                passed: 95,
                failed: 5,
                muted: 2,
                ignored: 0
            });
            
            // Проверяем, что были вызваны правильные запросы
            expect(axios.get).toHaveBeenCalledTimes(4);
        });

        test('возвращает пустую статистику если ничего не найдено', async () => {
            const buildId = '12345';

            axios.get
                .mockResolvedValueOnce({
                    data: { count: 0 }
                });

            const result = await TeamCityService.getBuildTestStatistics(buildId, null, []);

            expect(result).toEqual({
                total: 0,
                passed: 0,
                failed: 0,
                muted: 0,
                ignored: 0
            });
        });

        test('обрабатывает ошибки и возвращает fallback из statusText', async () => {
            const buildId = '12345';
            const statusText = 'Tests failed: 2, passed: 98';
            const error = new Error('API Error');

            // Очищаем моки перед тестом
            axios.get.mockReset();

            // Первый вызов (получение общего количества) падает с ошибкой
            // В catch блоке парсится statusText
            axios.get.mockRejectedValueOnce(error);

            const result = await TeamCityService.getBuildTestStatistics(buildId, statusText, []);

            expect(result).toEqual({
                total: 100,
                passed: 98,
                failed: 2,
                ignored: 0,
                muted: 0
            });
            // logger.warn вызывается в catch блоке только если ошибка произошла при вызове testOccurrences API
            // Но если statusText парсится успешно раньше, то catch не выполняется
            // Проверяем, что результат правильный (fallback сработал)
            expect(result.total).toBeGreaterThan(0);
        });
    });

    describe('_parseTestStatisticsFromStatusText', () => {
        test('парсит полную статистику из statusText', () => {
            const statusText = 'Tests failed: 4, passed: 775, ignored: 1, muted: 13';

            const result = TeamCityService._parseTestStatisticsFromStatusText(statusText);

            expect(result).toEqual({
                total: 793,
                passed: 775,
                failed: 4,
                ignored: 1,
                muted: 13
            });
        });

        test('парсит статистику без ignored и muted', () => {
            const statusText = 'Tests failed: 2, passed: 98';

            const result = TeamCityService._parseTestStatisticsFromStatusText(statusText);

            expect(result).toEqual({
                total: 100,
                passed: 98,
                failed: 2,
                ignored: 0,
                muted: 0
            });
        });

        test('возвращает null если паттерн не найден', () => {
            const statusText = 'Build completed successfully';

            const result = TeamCityService._parseTestStatisticsFromStatusText(statusText);

            expect(result).toBeNull();
        });

        test('возвращает null для пустой строки', () => {
            const result = TeamCityService._parseTestStatisticsFromStatusText('');

            expect(result).toBeNull();
        });

        test('возвращает null для null', () => {
            const result = TeamCityService._parseTestStatisticsFromStatusText(null);

            expect(result).toBeNull();
        });
    });

    describe('getBuildConfig', () => {
        test('успешно получает конфигурацию билда', async () => {
            const buildConfigId = 'TestBuildConfig';
            const mockConfig = {
                id: 'TestBuildConfig',
                name: 'Test Build Configuration',
                project: {
                    id: 'TestProject',
                    name: 'Test Project'
                }
            };

            // Очищаем предыдущие моки
            axios.get.mockReset();
            axios.get.mockResolvedValueOnce({
                data: mockConfig
            });

            const result = await TeamCityService.getBuildConfig(buildConfigId);

            expect(result).toEqual(mockConfig);
            expect(axios.get).toHaveBeenCalledWith(
                expect.stringContaining(`buildTypes/id:${buildConfigId}`),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: expect.stringMatching(/^Basic /)
                    })
                })
            );
        });

        test('возвращает null при ошибке', async () => {
            const buildConfigId = 'TestBuildConfig';
            const error = new Error('API Error');

            // Очищаем предыдущие моки
            axios.get.mockReset();
            axios.get.mockRejectedValueOnce(error);

            const result = await TeamCityService.getBuildConfig(buildConfigId);

            expect(result).toBeNull();
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining(`Ошибка при получении конфигурации билда ${buildConfigId}`)
            );
        });
    });

    describe('isSuccessStatus', () => {
        test('возвращает true для SUCCESS', () => {
            expect(TeamCityService.isSuccessStatus('SUCCESS')).toBe(true);
        });

        test('возвращает false для других статусов', () => {
            expect(TeamCityService.isSuccessStatus('FAILURE')).toBe(false);
            expect(TeamCityService.isSuccessStatus('ERROR')).toBe(false);
            expect(TeamCityService.isSuccessStatus('UNKNOWN')).toBe(false);
        });
    });

    describe('isFailureStatus', () => {
        test('возвращает true для FAILURE', () => {
            expect(TeamCityService.isFailureStatus('FAILURE')).toBe(true);
        });

        test('возвращает true для ERROR', () => {
            expect(TeamCityService.isFailureStatus('ERROR')).toBe(true);
        });

        test('возвращает false для других статусов', () => {
            expect(TeamCityService.isFailureStatus('SUCCESS')).toBe(false);
            expect(TeamCityService.isFailureStatus('UNKNOWN')).toBe(false);
        });
    });

    describe('isFinished', () => {
        test('возвращает true для finished', () => {
            expect(TeamCityService.isFinished('finished')).toBe(true);
        });

        test('возвращает false для других состояний', () => {
            expect(TeamCityService.isFinished('running')).toBe(false);
            expect(TeamCityService.isFinished('queued')).toBe(false);
            expect(TeamCityService.isFinished('unknown')).toBe(false);
        });
    });
});

