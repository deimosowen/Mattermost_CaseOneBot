const GitlabService = require('./index');
const logger = require('../../logger');

/**
 * Конфигурация для автоматического разрешения конфликтов
 */
const CONFLICT_CONFIG = {
    allowedFiles: [
        'Sites/CaseMap.Core/CaseMap.Core.csproj',
        'Sites/CaseMapStart.Core/CaseMapStart.Core.csproj'
    ],
    conflictProperty: 'FrontendVersion',
    allowedRoles: ['@c1-back']
};

/**
 * Проверяет, есть ли конфликт только в указанном свойстве
 * @param {string} fileContent - Содержимое файла
 * @param {string} property - Имя свойства для проверки
 * @returns {boolean} - true, если конфликт только в указанном свойстве
 */
function hasOnlyPropertyConflict(fileContent, property) {
    // Сначала проверяем общее количество конфликтов в файле
    const allConflicts = fileContent.match(/<<<<<<</g);
    if (!allConflicts || allConflicts.length === 0) {
        return false;
    }

    // Если в файле больше одного конфликта, это не "только в указанном свойстве"
    if (allConflicts.length > 1) {
        return false;
    }

    const conflictPattern = new RegExp(`<<<<<<<[\\s\\S]*?${property}[\\s\\S]*?=======[\\s\\S]*?>>>>>>>`, 'g');
    const matches = [...fileContent.matchAll(conflictPattern)];

    if (matches.length === 0) {
        return false;
    }

    // Проверяем, что конфликт содержит только один блок конфликта
    // и что в блоке конфликта нет других свойств с конфликтами
    return matches.every(match => {
        const conflictBlock = match[0];
        const conflictMarkers = conflictBlock.match(/<<<<<<<|=======|>>>>>>>/g);

        // Должен быть только один блок конфликта (3 маркера)
        if (!conflictMarkers || conflictMarkers.length !== 3) {
            return false;
        }

        // Проверяем, что в блоке конфликта нет других свойств с тегами <PropertyName>
        // кроме указанного свойства
        const beforeEquals = conflictBlock.split('=======')[0];
        const afterEquals = conflictBlock.split('=======')[1];

        // Ищем все XML теги в части до =======
        const xmlTagsBefore = beforeEquals.match(/<(\w+)>/g) || [];
        const xmlTagsAfter = afterEquals.match(/<(\w+)>/g) || [];

        // Убираем теги самого свойства и проверяем, что других свойств нет
        const otherTagsBefore = xmlTagsBefore.filter(tag => !tag.includes(property));
        const otherTagsAfter = xmlTagsAfter.filter(tag => !tag.includes(property));

        // Если есть другие теги, значит конфликт не только в указанном свойстве
        return otherTagsBefore.length === 0 && otherTagsAfter.length === 0;
    });
}

/**
 * Разрешает конфликт, выбирая версию из текущей ветки (не develop)
 * @param {string} fileContent - Содержимое файла с конфликтами
 * @param {string} property - Имя свойства для разрешения
 * @returns {string} - Разрешенное содержимое файла
 */
function resolveConflict(fileContent, property) {
    // Формат конфликта:
    // <<<<<<< ветка
    //     <PropertyName>версия_из_текущей_ветки</PropertyName>
    // =======
    //     <PropertyName>версия_из_develop</PropertyName>
    // >>>>>>> ветка

    const pattern = new RegExp(
        `<<<<<<<[\\s\\S]*?<${property}>([\\s\\S]*?)<\\/${property}>[\\s\\S]*?=======[\\s\\S]*?<${property}>[\\s\\S]*?<\\/${property}>[\\s\\S]*?>>>>>>>`,
        'g'
    );

    return fileContent.replace(pattern, (match, currentVersion) => {
        // currentVersion - версия из текущей ветки (до =======)
        const resolvedVersion = currentVersion.trim();
        return `    <${property}>${resolvedVersion}</${property}>`;
    });
}

/**
 * Пытается автоматически разрешить конфликты для указанного MR
 * @param {Object} mrData - Данные о merge request { project, mrIid, tag, url }
 * @returns {Promise<{resolved: boolean, files: string[]}>} - Результат разрешения конфликтов
 */
async function tryResolveBackendConflicts(mrData) {
    const { project, mrIid, tag } = mrData;

    // Проверяем, что это бэк
    if (!CONFLICT_CONFIG.allowedRoles.includes(tag)) {
        return { resolved: false, files: [] };
    }

    try {
        const projectInfo = await GitlabService.getProjectByName(project);
        if (!projectInfo) {
            logger.warn(`[ConflictResolver] Проект ${project} не найден`);
            return { resolved: false, files: [] };
        }

        const mrInfo = await GitlabService.getMergeRequestInfo(projectInfo.project_id, mrIid);
        if (!mrInfo || !mrInfo.has_conflicts) {
            return { resolved: false, files: [] };
        }

        const sourceBranch = mrInfo.source_branch;
        const resolvedFiles = [];

        // Проверяем каждый разрешенный файл
        for (const filePath of CONFLICT_CONFIG.allowedFiles) {
            try {
                const fileContent = await GitlabService.getFileContent(
                    projectInfo.project_id,
                    filePath,
                    sourceBranch
                );

                if (!fileContent) {
                    continue;
                }

                // Проверяем, есть ли конфликт только в FrontendVersion
                if (!hasOnlyPropertyConflict(fileContent, CONFLICT_CONFIG.conflictProperty)) {
                    logger.info(`[ConflictResolver] Конфликт в ${filePath} не только в ${CONFLICT_CONFIG.conflictProperty}, пропускаем`);
                    continue;
                }

                // Разрешаем конфликт
                const resolvedContent = resolveConflict(fileContent, CONFLICT_CONFIG.conflictProperty);

                // Проверяем, что файл действительно изменился
                if (resolvedContent === fileContent) {
                    logger.info(`[ConflictResolver] Файл ${filePath} не изменился после разрешения конфликтов`);
                    continue;
                }

                // Обновляем файл в репозитории
                const commitMessage = `Auto-resolve ${CONFLICT_CONFIG.conflictProperty} conflict in ${filePath}`;
                const success = await GitlabService.updateFile(
                    projectInfo.project_id,
                    filePath,
                    sourceBranch,
                    resolvedContent,
                    commitMessage
                );

                if (success) {
                    resolvedFiles.push(filePath);
                    logger.info(`[ConflictResolver] Автоматически разрешен конфликт в ${filePath} для MR ${mrData.url}`);
                }
            } catch (error) {
                logger.error(`[ConflictResolver] Ошибка при разрешении конфликта в ${filePath}: ${error.message}`);
            }
        }

        return {
            resolved: resolvedFiles.length > 0,
            files: resolvedFiles
        };
    } catch (error) {
        logger.error(`[ConflictResolver] Ошибка при попытке разрешения конфликтов для ${tag}: ${error.message}`);
        return { resolved: false, files: [] };
    }
}

module.exports = {
    tryResolveBackendConflicts,
    hasOnlyPropertyConflict,
    resolveConflict,
    CONFLICT_CONFIG
};

