require('./conflictResolver.setup');

const {
    GitlabService,
    logger,
} = require('./conflictResolver.setup');

const {
    tryResolveBackendConflicts,
    hasOnlyPropertyConflict,
    resolveConflict,
    CONFLICT_CONFIG
} = require('../../../services/gitlabService/conflictResolver');

describe('ConflictResolver', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('hasOnlyPropertyConflict', () => {
        test('возвращает true для конфликта только в FrontendVersion', () => {
            const fileContent = `
  <PropertyGroup>
    <BackendVersion>#(empty)</BackendVersion>
    <FrontendPackage>CasePro.Frontend</FrontendPackage>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
=======
    <FrontendVersion>80.0.1041-develop</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
            `;

            const result = hasOnlyPropertyConflict(fileContent, 'FrontendVersion');
            expect(result).toBe(true);
        });

        test('возвращает false если конфликтов нет', () => {
            const fileContent = `
  <PropertyGroup>
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
  </PropertyGroup>
            `;

            const result = hasOnlyPropertyConflict(fileContent, 'FrontendVersion');
            expect(result).toBe(false);
        });

        test('возвращает false если конфликт в нескольких свойствах', () => {
            const fileContent = `
  <PropertyGroup>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <BackendVersion>1.0.0</BackendVersion>
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
=======
    <BackendVersion>2.0.0</BackendVersion>
    <FrontendVersion>80.0.1041-develop</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
            `;

            const result = hasOnlyPropertyConflict(fileContent, 'FrontendVersion');
            expect(result).toBe(false);
        });

        test('возвращает false если несколько конфликтов', () => {
            const fileContent = `
  <PropertyGroup>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
=======
    <FrontendVersion>80.0.1041-develop</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <BackendVersion>1.0.0</BackendVersion>
=======
    <BackendVersion>2.0.0</BackendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
            `;

            const result = hasOnlyPropertyConflict(fileContent, 'FrontendVersion');
            expect(result).toBe(false);
        });
    });

    describe('resolveConflict', () => {
        test('разрешает конфликт, выбирая версию из текущей ветки', () => {
            const fileContent = `
  <PropertyGroup>
    <BackendVersion>#(empty)</BackendVersion>
    <FrontendPackage>CasePro.Frontend</FrontendPackage>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
=======
    <FrontendVersion>80.0.1041-develop</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
            `;

            const result = resolveConflict(fileContent, 'FrontendVersion');

            expect(result).toContain('<FrontendVersion>80.0.0-F9848V12012</FrontendVersion>');
            expect(result).not.toContain('80.0.1041-develop');
            expect(result).not.toContain('<<<<<<<');
            expect(result).not.toContain('=======');
            expect(result).not.toContain('>>>>>>>');
        });

        test('разрешает несколько конфликтов в одном файле', () => {
            const fileContent = `
  <PropertyGroup>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
=======
    <FrontendVersion>80.0.1041-develop</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
  <PropertyGroup>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <FrontendVersion>81.0.0-F9848V12013</FrontendVersion>
=======
    <FrontendVersion>81.0.1042-develop</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
            `;

            const result = resolveConflict(fileContent, 'FrontendVersion');

            expect(result).toContain('<FrontendVersion>80.0.0-F9848V12012</FrontendVersion>');
            expect(result).toContain('<FrontendVersion>81.0.0-F9848V12013</FrontendVersion>');
            expect(result).not.toContain('80.0.1041-develop');
            expect(result).not.toContain('81.0.1042-develop');
            expect(result.match(/<<<<<<</g)).toBeNull();
        });

        test('не изменяет файл без конфликтов', () => {
            const fileContent = `
  <PropertyGroup>
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
  </PropertyGroup>
            `;

            const result = resolveConflict(fileContent, 'FrontendVersion');

            expect(result).toBe(fileContent);
        });
    });

    describe('tryResolveBackendConflicts', () => {
        const mrData = {
            project: 'test-project',
            mrIid: 123,
            tag: '@c1-back',
            url: 'https://gitlab.example.com/test-project/-/merge_requests/123'
        };

        test('возвращает false для не-бэк роли', async () => {
            const frontMrData = { ...mrData, tag: '@c1-front' };

            const result = await tryResolveBackendConflicts(frontMrData);

            expect(result).toEqual({ resolved: false, files: [] });
            expect(GitlabService.getProjectByName).not.toHaveBeenCalled();
        });

        test('возвращает false если проект не найден', async () => {
            GitlabService.getProjectByName.mockResolvedValueOnce(null);

            const result = await tryResolveBackendConflicts(mrData);

            expect(result).toEqual({ resolved: false, files: [] });
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Проект test-project не найден'));
        });

        test('возвращает false если MR не имеет конфликтов', async () => {
            GitlabService.getMergeRequestInfo.mockResolvedValueOnce({
                source_branch: 'feature-branch',
                target_branch: 'develop',
                has_conflicts: false
            });

            const result = await tryResolveBackendConflicts(mrData);

            expect(result).toEqual({ resolved: false, files: [] });
        });

        test('возвращает false если файл не найден', async () => {
            GitlabService.getFileContent.mockResolvedValue(null);

            const result = await tryResolveBackendConflicts(mrData);

            expect(result).toEqual({ resolved: false, files: [] });
        });

        test('пропускает файл если конфликт не только в FrontendVersion', async () => {
            const fileContent = `
  <PropertyGroup>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <BackendVersion>1.0.0</BackendVersion>
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
=======
    <BackendVersion>2.0.0</BackendVersion>
    <FrontendVersion>80.0.1041-develop</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
            `;

            GitlabService.getFileContent.mockResolvedValueOnce(fileContent);

            const result = await tryResolveBackendConflicts(mrData);

            expect(result).toEqual({ resolved: false, files: [] });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('не только в FrontendVersion'));
            expect(GitlabService.updateFile).not.toHaveBeenCalled();
        });

        test('успешно разрешает конфликт в разрешенном файле', async () => {
            const fileContent = `
  <PropertyGroup>
    <BackendVersion>#(empty)</BackendVersion>
    <FrontendPackage>CasePro.Frontend</FrontendPackage>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
=======
    <FrontendVersion>80.0.1041-develop</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
            `;

            const resolvedContent = `
  <PropertyGroup>
    <BackendVersion>#(empty)</BackendVersion>
    <FrontendPackage>CasePro.Frontend</FrontendPackage>
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
  </PropertyGroup>
            `;

            GitlabService.getFileContent.mockResolvedValueOnce(fileContent);
            GitlabService.updateFile.mockResolvedValueOnce(true);

            const result = await tryResolveBackendConflicts(mrData);

            expect(result.resolved).toBe(true);
            expect(result.files).toContain('Sites/CaseMap.Core/CaseMap.Core.csproj');
            expect(GitlabService.updateFile).toHaveBeenCalledWith(
                1,
                'Sites/CaseMap.Core/CaseMap.Core.csproj',
                'feature-branch',
                expect.stringContaining('<FrontendVersion>80.0.0-F9848V12012</FrontendVersion>'),
                expect.stringContaining('Auto-resolve FrontendVersion conflict')
            );
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Автоматически разрешен конфликт'));
        });

        test('обрабатывает несколько разрешенных файлов', async () => {
            const fileContent1 = `
  <PropertyGroup>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
=======
    <FrontendVersion>80.0.1041-develop</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
            `;

            const fileContent2 = `
  <PropertyGroup>
<<<<<<< Sites/CaseMapStart.Core/CaseMapStart.Core.csproj
    <FrontendVersion>81.0.0-F9848V12013</FrontendVersion>
=======
    <FrontendVersion>81.0.1042-develop</FrontendVersion>
>>>>>>> Sites/CaseMapStart.Core/CaseMapStart.Core.csproj
  </PropertyGroup>
            `;

            GitlabService.getFileContent
                .mockResolvedValueOnce(fileContent1)
                .mockResolvedValueOnce(fileContent2);
            GitlabService.updateFile
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(true);

            const result = await tryResolveBackendConflicts(mrData);

            expect(result.resolved).toBe(true);
            expect(result.files).toHaveLength(2);
            expect(result.files).toContain('Sites/CaseMap.Core/CaseMap.Core.csproj');
            expect(result.files).toContain('Sites/CaseMapStart.Core/CaseMapStart.Core.csproj');
            expect(GitlabService.updateFile).toHaveBeenCalledTimes(2);
        });

        test('обновляет файл даже если версии одинаковые (убираются маркеры конфликта)', async () => {
            // Файл с конфликтом, где версии одинаковые
            // После разрешения файл изменится (уберутся маркеры конфликта), что корректно
            const fileContent = `
  <PropertyGroup>
    <BackendVersion>#(empty)</BackendVersion>
    <FrontendPackage>CasePro.Frontend</FrontendPackage>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
=======
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
            `;

            GitlabService.getFileContent.mockResolvedValueOnce(fileContent);
            GitlabService.updateFile.mockResolvedValueOnce(true);

            const result = await tryResolveBackendConflicts(mrData);

            // Файл изменится (убрались маркеры конфликта), поэтому он будет обновлен
            expect(result.resolved).toBe(true);
            expect(result.files).toContain('Sites/CaseMap.Core/CaseMap.Core.csproj');
            expect(GitlabService.updateFile).toHaveBeenCalled();
        });

        test('обрабатывает ошибку при обновлении файла', async () => {
            const fileContent = `
  <PropertyGroup>
<<<<<<< Sites/CaseMap.Core/CaseMap.Core.csproj
    <FrontendVersion>80.0.0-F9848V12012</FrontendVersion>
=======
    <FrontendVersion>80.0.1041-develop</FrontendVersion>
>>>>>>> Sites/CaseMap.Core/CaseMap.Core.csproj
  </PropertyGroup>
            `;

            GitlabService.getFileContent.mockResolvedValueOnce(fileContent);
            GitlabService.updateFile.mockResolvedValueOnce(false);

            const result = await tryResolveBackendConflicts(mrData);

            expect(result).toEqual({ resolved: false, files: [] });
            expect(logger.error).not.toHaveBeenCalled();
        });

        test('обрабатывает исключение при получении файла', async () => {
            GitlabService.getFileContent.mockRejectedValueOnce(new Error('File not found'));

            const result = await tryResolveBackendConflicts(mrData);

            expect(result).toEqual({ resolved: false, files: [] });
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Ошибка при разрешении конфликта'));
        });

        test('обрабатывает общее исключение', async () => {
            GitlabService.getProjectByName.mockRejectedValueOnce(new Error('API error'));

            const result = await tryResolveBackendConflicts(mrData);

            expect(result).toEqual({ resolved: false, files: [] });
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Ошибка при попытке разрешения конфликтов'));
        });
    });
});

