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
 * @param {string} filePath - Путь к файлу (для логирования)
 * @returns {boolean} - true, если конфликт только в указанном свойстве
 */
function hasOnlyPropertyConflict(fileContent, property, filePath = '') {
    logger.info(`[ConflictResolver] Проверка конфликта для ${filePath}, свойство: ${property}`);

    // Сначала проверяем общее количество конфликтов в файле
    const allConflicts = fileContent.match(/<<<<<<</g);
    if (!allConflicts || allConflicts.length === 0) {
        logger.info(`[ConflictResolver] ${filePath}: Нет конфликтов в файле`);
        return false;
    }

    logger.info(`[ConflictResolver] ${filePath}: Найдено конфликтов: ${allConflicts.length}`);

    // Если в файле больше одного конфликта, это не "только в указанном свойстве"
    if (allConflicts.length > 1) {
        logger.info(`[ConflictResolver] ${filePath}: Больше одного конфликта, пропускаем`);
        return false;
    }

    const conflictPattern = new RegExp(`<<<<<<<[\\s\\S]*?=======[\\s\\S]*?>>>>>>>`, 'g');
    const matches = [...fileContent.matchAll(conflictPattern)];

    if (matches.length === 0) {
        logger.info(`[ConflictResolver] ${filePath}: Не найдено блоков конфликта по паттерну`);
        return false;
    }

    logger.info(`[ConflictResolver] ${filePath}: Найдено блоков конфликта: ${matches.length}`);

    // Проверяем каждый блок конфликта
    return matches.every(match => {
        const conflictBlock = match[0];
        const conflictMarkers = conflictBlock.match(/<<<<<<<|=======|>>>>>>>/g);

        logger.info(`[ConflictResolver] ${filePath}: Маркеров конфликта в блоке: ${conflictMarkers ? conflictMarkers.length : 0}`);

        // Должен быть только один блок конфликта (3 маркера)
        if (!conflictMarkers || conflictMarkers.length !== 3) {
            logger.info(`[ConflictResolver] ${filePath}: Неправильное количество маркеров конфликта`);
            return false;
        }

        // Разделяем блок конфликта на части
        const parts = conflictBlock.split('=======');
        let beforeEquals = parts[0].replace(/<<<<<<<[^\n]*\n?/, ''); // Убираем маркер начала конфликта
        let afterEquals = parts[1].replace(/\n?>>>>>>>[^\n]*/, ''); // Убираем маркер конца конфликта

        logger.info(`[ConflictResolver] ${filePath}: Часть до ======= (первые 200 символов): ${beforeEquals.substring(0, 200)}`);
        logger.info(`[ConflictResolver] ${filePath}: Часть после ======= (первые 200 символов): ${afterEquals.substring(0, 200)}`);

        // Проверяем, что в блоке конфликта есть указанное свойство
        const propertyTagPattern = new RegExp(`<${property}>[\\s\\S]*?<\/${property}>`, 'g');
        const propertyMatchesBefore = [...beforeEquals.matchAll(propertyTagPattern)];
        const propertyMatchesAfter = [...afterEquals.matchAll(propertyTagPattern)];

        logger.info(`[ConflictResolver] ${filePath}: Найдено вхождений ${property} до =======: ${propertyMatchesBefore.length}`);
        logger.info(`[ConflictResolver] ${filePath}: Найдено вхождений ${property} после =======: ${propertyMatchesAfter.length}`);

        // Должно быть ровно одно вхождение свойства в каждой части
        if (propertyMatchesBefore.length !== 1 || propertyMatchesAfter.length !== 1) {
            logger.info(`[ConflictResolver] ${filePath}: Неправильное количество вхождений свойства ${property}`);
            return false;
        }

        // Проверяем, что значения свойства действительно разные (конфликтуют)
        const beforeValue = propertyMatchesBefore[0][0].replace(/<\/?[^>]+>/g, '').trim();
        const afterValue = propertyMatchesAfter[0][0].replace(/<\/?[^>]+>/g, '').trim();

        logger.info(`[ConflictResolver] ${filePath}: Значение ${property} до =======: "${beforeValue}"`);
        logger.info(`[ConflictResolver] ${filePath}: Значение ${property} после =======: "${afterValue}"`);

        if (beforeValue === afterValue) {
            logger.info(`[ConflictResolver] ${filePath}: Значения ${property} одинаковы, конфликта нет`);
            return false; // Значения одинаковы, конфликта нет
        }

        // Убираем указанное свойство из обеих частей
        // Удаляем тег свойства со всем содержимым, включая пробелы и переносы строк вокруг
        const removeProperty = (text, prop) => {
            // Удаляем тег свойства со всем содержимым
            // Паттерн ищет открывающий тег, содержимое и закрывающий тег, включая пробелы вокруг
            const tagPattern = new RegExp(`\\s*<${prop}>[\\s\\S]*?<\/${prop}>\\s*`, 'g');
            return text.replace(tagPattern, '');
        };

        beforeEquals = removeProperty(beforeEquals, property);
        afterEquals = removeProperty(afterEquals, property);

        logger.info(`[ConflictResolver] ${filePath}: После удаления ${property}, часть до ======= (первые 200 символов): ${beforeEquals.substring(0, 200)}`);
        logger.info(`[ConflictResolver] ${filePath}: После удаления ${property}, часть после ======= (первые 200 символов): ${afterEquals.substring(0, 200)}`);

        // Нормализуем пробелы и переносы строк для сравнения
        // Удаляем ВСЕ пробелы, оставляя только XML структуру
        const normalize = (text) => {
            // Удаляем все пробелы, табы и переносы строк полностью
            return text
                .replace(/\s+/g, '')  // Удаляем все пробельные символы
                .trim();
        };
        let normalizedBefore = normalize(beforeEquals);
        let normalizedAfter = normalize(afterEquals);

        // Если разница только в длине (1 символ), обрезаем обе части до одинаковой длины
        // и сравниваем (это может быть из-за различий в форматировании при создании маркеров конфликта)
        if (Math.abs(normalizedBefore.length - normalizedAfter.length) === 1) {
            const minLength = Math.min(normalizedBefore.length, normalizedAfter.length);
            // Сравниваем части до минимальной длины
            const beforeTrimmed = normalizedBefore.substring(0, minLength);
            const afterTrimmed = normalizedAfter.substring(0, minLength);

            // Если обрезанные части идентичны, считаем что разница только в лишнем символе в конце
            if (beforeTrimmed === afterTrimmed) {
                logger.info(`[ConflictResolver] ${filePath}: Обнаружена разница в 1 символ в конце, части идентичны после обрезки`);
                normalizedBefore = beforeTrimmed;
                normalizedAfter = afterTrimmed;
            }
        }

        logger.info(`[ConflictResolver] ${filePath}: Нормализованная часть до ======= (первые 200 символов): ${normalizedBefore.substring(0, 200)}`);
        logger.info(`[ConflictResolver] ${filePath}: Нормализованная часть после ======= (первые 200 символов): ${normalizedAfter.substring(0, 200)}`);
        logger.info(`[ConflictResolver] ${filePath}: Части идентичны: ${normalizedBefore === normalizedAfter}`);

        // Если после удаления указанного свойства остальные строки одинаковы,
        // значит конфликт только в указанном свойстве
        if (normalizedBefore !== normalizedAfter) {
            logger.info(`[ConflictResolver] ${filePath}: Части после удаления ${property} НЕ идентичны. Длина до: ${normalizedBefore.length}, после: ${normalizedAfter.length}`);

            // Найдем первое различие
            const minLength = Math.min(normalizedBefore.length, normalizedAfter.length);
            let foundDifference = false;
            for (let i = 0; i < minLength; i++) {
                if (normalizedBefore[i] !== normalizedAfter[i]) {
                    logger.info(`[ConflictResolver] ${filePath}: Первое различие на позиции ${i}: "${normalizedBefore[i]}" (код ${normalizedBefore.charCodeAt(i)}) vs "${normalizedAfter[i]}" (код ${normalizedAfter.charCodeAt(i)})`);
                    logger.info(`[ConflictResolver] ${filePath}: Контекст до (100 символов): "${normalizedBefore.substring(Math.max(0, i - 50), i + 50)}"`);
                    logger.info(`[ConflictResolver] ${filePath}: Контекст после (100 символов): "${normalizedAfter.substring(Math.max(0, i - 50), i + 50)}"`);
                    foundDifference = true;
                    break;
                }
            }

            // Если одна часть длиннее другой, покажем где заканчивается короткая
            if (normalizedBefore.length !== normalizedAfter.length) {
                const longer = normalizedBefore.length > normalizedAfter.length ? normalizedBefore : normalizedAfter;
                const shorter = normalizedBefore.length > normalizedAfter.length ? normalizedAfter : normalizedBefore;
                logger.info(`[ConflictResolver] ${filePath}: Разная длина (${normalizedBefore.length} vs ${normalizedAfter.length}). Остаток более длинной части (первые 200 символов): "${longer.substring(minLength, minLength + 200)}"`);
                logger.info(`[ConflictResolver] ${filePath}: Конец более короткой части (последние 200 символов): "${shorter.substring(Math.max(0, shorter.length - 200))}"`);
                if (!foundDifference) {
                    logger.info(`[ConflictResolver] ${filePath}: Различие только в длине - возможно, лишний символ в конце`);
                }
            }
        }

        return normalizedBefore === normalizedAfter;
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

        logger.info(`[ConflictResolver] Обнаружены конфликты в MR ${mrData.url}. Проверяем файлы: ${CONFLICT_CONFIG.allowedFiles.join(', ')}`);

        const sourceBranch = mrInfo.source_branch;
        const targetBranch = mrInfo.target_branch;
        const filesToUpdate = []; // Собираем все файлы для обновления

        // Сначала проверяем все файлы и собираем те, которые нужно обновить
        for (const filePath of CONFLICT_CONFIG.allowedFiles) {
            try {
                // Получаем содержимое файла напрямую из обеих веток
                const [sourceContent, targetContent] = await Promise.all([
                    GitlabService.getFileContent(projectInfo.project_id, filePath, sourceBranch),
                    GitlabService.getFileContent(projectInfo.project_id, filePath, targetBranch)
                ]);

                if (!sourceContent || !targetContent) {
                    logger.info(`[ConflictResolver] ${filePath}: Файл отсутствует в одной из веток, пропускаем`);
                    continue;
                }

                // Если содержимое одинаковое, конфликта нет
                if (sourceContent === targetContent) {
                    logger.info(`[ConflictResolver] ${filePath}: Содержимое в обеих ветках идентично, конфликта нет, пропускаем`);
                    continue;
                }

                logger.info(`[ConflictResolver] ${filePath}: Получено содержимое из source (${sourceContent.length} символов) и target (${targetContent.length} символов)`);

                // Извлекаем версию FrontendVersion из source ветки (вашей ветки)
                const versionPattern = new RegExp(`<${CONFLICT_CONFIG.conflictProperty}>([\\s\\S]*?)<\/${CONFLICT_CONFIG.conflictProperty}>`, 'g');
                const sourceVersionMatch = [...sourceContent.matchAll(versionPattern)];
                const targetVersionMatch = [...targetContent.matchAll(versionPattern)];

                if (sourceVersionMatch.length === 0) {
                    logger.warn(`[ConflictResolver] ${filePath}: Не найдено ${CONFLICT_CONFIG.conflictProperty} в source ветке`);
                    continue;
                }

                if (targetVersionMatch.length === 0) {
                    logger.warn(`[ConflictResolver] ${filePath}: Не найдено ${CONFLICT_CONFIG.conflictProperty} в target ветке`);
                    continue;
                }

                const sourceVersion = sourceVersionMatch[0][1].trim();
                const targetVersion = targetVersionMatch[0][1].trim();

                logger.info(`[ConflictResolver] ${filePath}: Версия из source (ваша ветка): "${sourceVersion}", версия из target: "${targetVersion}"`);

                // Проверяем, что версии действительно отличаются
                if (sourceVersion === targetVersion) {
                    logger.info(`[ConflictResolver] ${filePath}: Версии FrontendVersion в обеих ветках одинаковые ("${sourceVersion}"), конфликта нет, пропускаем`);
                    continue;
                }

                // Проверяем, что конфликт только в FrontendVersion
                // Убираем FrontendVersion из обоих файлов и нормализуем содержимое для сравнения
                // Агрессивная нормализация: убираем все пробелы, переводы строк и табуляции
                const normalize = (text) => {
                    return text
                        .replace(versionPattern, '') // Убираем FrontendVersion
                        .replace(/\s+/g, '') // Убираем все пробельные символы
                        .trim();
                };

                const sourceWithoutVersion = normalize(sourceContent);
                const targetWithoutVersion = normalize(targetContent);

                logger.info(`[ConflictResolver] ${filePath}: Сравнение содержимого без FrontendVersion: source длина=${sourceWithoutVersion.length}, target длина=${targetWithoutVersion.length}`);

                if (sourceWithoutVersion !== targetWithoutVersion) {
                    // Логируем первые различия для диагностики
                    const minLen = Math.min(sourceWithoutVersion.length, targetWithoutVersion.length);
                    for (let i = 0; i < minLen; i++) {
                        if (sourceWithoutVersion[i] !== targetWithoutVersion[i]) {
                            logger.info(`[ConflictResolver] ${filePath}: Первое различие на позиции ${i}: "${sourceWithoutVersion.substring(Math.max(0, i - 20), i + 20)}" vs "${targetWithoutVersion.substring(Math.max(0, i - 20), i + 20)}"`);
                            break;
                        }
                    }
                    if (sourceWithoutVersion.length !== targetWithoutVersion.length) {
                        logger.info(`[ConflictResolver] ${filePath}: Длины отличаются: source=${sourceWithoutVersion.length}, target=${targetWithoutVersion.length}`);
                    }
                    logger.info(`[ConflictResolver] ${filePath}: Конфликт не только в ${CONFLICT_CONFIG.conflictProperty}, есть другие различия. Автоматическое разрешение невозможно, пропускаем`);
                    continue;
                }

                logger.info(`[ConflictResolver] ${filePath}: Обнаружен конфликт только в ${CONFLICT_CONFIG.conflictProperty}. Начинаем разрешение конфликта.`);

                // Берем содержимое из target ветки и заменяем FrontendVersion на версию из source (вашей ветки)
                logger.info(`[ConflictResolver] ${filePath}: Заменяем версию "${targetVersion}" на "${sourceVersion}" (из вашей ветки)`);

                // Заменяем версию в target ветке на версию из source
                let resolvedContent = targetContent.replace(
                    versionPattern,
                    `<${CONFLICT_CONFIG.conflictProperty}>${sourceVersion}</${CONFLICT_CONFIG.conflictProperty}>`
                );

                // Проверяем, что замена действительно произошла
                const resolvedVersionMatch = [...resolvedContent.matchAll(versionPattern)];
                const resolvedVersion = resolvedVersionMatch.length > 0 ? resolvedVersionMatch[0][1].trim() : null;

                logger.info(`[ConflictResolver] ${filePath}: Проверка замены - ожидаем: "${sourceVersion}", получено: "${resolvedVersion}"`);

                if (resolvedVersion !== sourceVersion) {
                    logger.error(`[ConflictResolver] ${filePath}: ОШИБКА! Замена не произошла. Ожидалось: "${sourceVersion}", получено: "${resolvedVersion}"`);
                    continue;
                }

                logger.info(`[ConflictResolver] ${filePath}: ✓ Замена FrontendVersion успешна: "${targetVersion}" -> "${sourceVersion}"`);

                // Нормализуем конец файла - всегда добавляем новую строку в конце
                resolvedContent = resolvedContent.replace(/[\r\n\s]+$/, '') + '\n';

                // Добавляем файл в список для обновления
                // resolvedContent содержит содержимое из target ветки с версией FrontendVersion из source ветки
                filesToUpdate.push({ filePath, content: resolvedContent });
                logger.info(`[ConflictResolver] ${filePath}: Конфликт разрешен, файл подготовлен для коммита`);
            } catch (error) {
                logger.error(`[ConflictResolver] Ошибка при разрешении конфликта в ${filePath}: ${error.message}`);
            }
        }

        // Обновляем все файлы одним коммитом
        if (filesToUpdate.length === 0) {
            logger.info(`[ConflictResolver] Не найдено файлов с конфликтами только в ${CONFLICT_CONFIG.conflictProperty} для автоматического разрешения`);
            return { resolved: false, files: [] };
        }

        logger.info(`[ConflictResolver] Найдено ${filesToUpdate.length} файл(ов) с конфликтами только в ${CONFLICT_CONFIG.conflictProperty}. Приступаем к разрешению конфликтов.`);

        const filePaths = filesToUpdate.map(f => f.filePath).join(', ');
        const commitMessage = `Auto-resolve ${CONFLICT_CONFIG.conflictProperty} conflicts in ${filePaths}`;

        logger.info(`[ConflictResolver] Создаем коммит для обновления ${filesToUpdate.length} файл(ов): ${filePaths}`);
        for (const file of filesToUpdate) {
            logger.info(`[ConflictResolver] - ${file.filePath} (${file.content.length} символов)`);
        }

        const success = await GitlabService.updateFiles(
            projectInfo.project_id,
            sourceBranch,
            filesToUpdate,
            commitMessage
        );

        if (success) {
            const resolvedFiles = filesToUpdate.map(f => f.filePath);
            logger.info(`[ConflictResolver] Коммит успешно создан. Обновлены файлы: ${resolvedFiles.join(', ')}`);

            // Ждем немного, чтобы GitLab пересчитал конфликты
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Проверяем, что файлы действительно обновлены
            logger.info(`[ConflictResolver] Проверяем, что файлы действительно обновлены...`);
            for (const file of filesToUpdate) {
                try {
                    const updatedContent = await GitlabService.getFileContent(
                        projectInfo.project_id,
                        file.filePath,
                        sourceBranch
                    );
                    // Нормализуем для сравнения (убираем различия в пробелах в конце)
                    const normalizedUpdated = (updatedContent || '').replace(/[\r\n\s]+$/, '');
                    const normalizedExpected = file.content.replace(/[\r\n\s]+$/, '');

                    if (normalizedUpdated === normalizedExpected) {
                        logger.info(`[ConflictResolver] ✓ Файл ${file.filePath} успешно обновлен`);
                    } else {
                        logger.warn(`[ConflictResolver] ⚠ Файл ${file.filePath} не совпадает с ожидаемым содержимым (возможно, различия в форматировании)`);
                    }
                } catch (error) {
                    logger.warn(`[ConflictResolver] Не удалось проверить обновление файла ${file.filePath}: ${error.message}`);
                }
            }

            // Проверяем статус MR после обновления
            logger.info(`[ConflictResolver] Проверяем статус MR после обновления файлов...`);
            try {
                const updatedMrInfo = await GitlabService.getMergeRequestInfo(projectInfo.project_id, mrIid);
                if (updatedMrInfo) {
                    if (!updatedMrInfo.has_conflicts) {
                        logger.info(`[ConflictResolver] ✓ Конфликты успешно разрешены! MR больше не имеет конфликтов.`);
                    } else {
                        logger.warn(`[ConflictResolver] ⚠ Конфликты все еще присутствуют в MR (has_conflicts=true). GitLab может пересчитать их через некоторое время.`);
                    }
                }
            } catch (error) {
                logger.warn(`[ConflictResolver] Не удалось проверить статус MR: ${error.message}`);
            }

            return {
                resolved: true,
                files: resolvedFiles
            };
        }

        return {
            resolved: false,
            files: []
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


