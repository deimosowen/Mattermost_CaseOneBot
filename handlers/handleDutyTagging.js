const { postMessageInTreed, getChannelById, getUserByUsername } = require('../mattermost/utils');
const { getAllActiveDutyTagSettings, getCurrentDuty } = require('../db/models/duty');
const { getNextDuty } = require('../services/dutyService');
const logger = require('../logger');

/**
 * Получает user ID из username для проверки исключений
 */
async function getUserIdFromUsername(username) {
    try {
        const cleanUsername = username.startsWith('@') ? username.substring(1) : username;
        const user = await getUserByUsername(cleanUsername);
        return user ? user.id : null;
    } catch (error) {
        logger.warn(`Could not get user ID for username ${username}:`, error);
        return null;
    }
}

/**
 * Проверяет, находится ли пользователь в списке исключений
 */
function isUserExcluded(userId, excludedUserIds) {
    if (!userId || !excludedUserIds || !Array.isArray(excludedUserIds)) {
        return false;
    }
    return excludedUserIds.includes(userId);
}

/**
 * Обработчики тегов для шаблона сообщения
 * Каждый обработчик - это async функция, которая возвращает значение для замены тега
 */
const tagHandlers = {
    /**
     * Обработчик тега {duty_mention} - текущий дежурный
     */
    '{duty_mention}': async (context) => {
        const { currentDuty, excludedUserIds } = context;
        if (!currentDuty || !currentDuty.user_id) {
            return '';
        }

        const dutyUserId = await getUserIdFromUsername(currentDuty.user_id);
        if (isUserExcluded(dutyUserId, excludedUserIds)) {
            logger.debug(`Duty ${currentDuty.user_id} (${dutyUserId}) is in exclusion list, removing tag`);
            return '';
        }

        return currentDuty.user_id;
    },

    /**
     * Обработчик тега {next_duty_mention} - следующий дежурный
     */
    '{next_duty_mention}': async (context) => {
        const { channelId, excludedUserIds } = context;
        const nextDuty = await getNextDuty(channelId);

        if (!nextDuty || !nextDuty.user_id) {
            logger.debug(`No next duty found for channel ${channelId}`);
            return '';
        }

        const nextDutyUserId = await getUserIdFromUsername(nextDuty.user_id);
        if (isUserExcluded(nextDutyUserId, excludedUserIds)) {
            logger.debug(`Next duty ${nextDuty.user_id} (${nextDutyUserId}) is in exclusion list, removing tag`);
            return '';
        }

        return nextDuty.user_id;
    }
};

/**
 * Обрабатывает шаблон сообщения, заменяя все теги на соответствующие значения
 */
async function processMessageTemplate(template, context) {
    if (!template) {
        return '{duty_mention}';
    }

    let message = template;

    // Обрабатываем каждый тег из зарегистрированных обработчиков
    for (const [tag, handler] of Object.entries(tagHandlers)) {
        if (message.includes(tag)) {
            try {
                const replacement = await handler(context);
                // Заменяем все вхождения тега на значение
                message = message.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
            } catch (error) {
                logger.error(`Error processing tag ${tag}:`, error);
                // В случае ошибки удаляем тег из сообщения
                message = message.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
            }
        }
    }

    return message;
}

module.exports = async (post, eventData) => {
    try {
        const isFromBot = post.props?.from_bot === true || post.props?.from_bot === 'true';

        // Получаем все активные настройки тэгания
        const tagSettings = await getAllActiveDutyTagSettings();
        if (!tagSettings || tagSettings.length === 0) {
            return;
        }

        // Получаем информацию о канале для проверки префикса
        let channel = null;
        try {
            channel = await getChannelById(post.channel_id);
        } catch (error) {
            logger.warn(`Could not get channel info for ${post.channel_id}:`, error);
            return;
        }

        const channelName = channel?.display_name || channel?.name || eventData.channel_name || '';

        // Проверяем каждую настройку
        for (const setting of tagSettings) {
            // Если сообщение от бота и настройка не разрешает ботов, пропускаем
            if (isFromBot && !setting.allow_bots) {
                continue;
            }

            // Проверяем префикс канала, если он указан
            if (setting.channel_prefix) {
                if (!channelName.startsWith(setting.channel_prefix)) {
                    continue;
                }
            }
            // Проверяем, есть ли в сообщении нужный тег
            const tagPattern = new RegExp(`\\b${setting.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (!tagPattern.test(post.message)) {
                continue;
            }

            // Получаем текущего дежурного для канала из настройки
            const currentDuty = await getCurrentDuty(setting.channel_id);
            if (!currentDuty || !currentDuty.user_id) {
                logger.debug(`No current duty found for channel ${setting.channel_id}`);
                continue;
            }

            // Проверяем, находится ли текущий дежурный в списке исключений
            // (проверяем до обработки шаблона, чтобы пропустить всю настройку, если текущий дежурный исключен)
            const dutyUserId = await getUserIdFromUsername(currentDuty.user_id);
            if (isUserExcluded(dutyUserId, setting.excluded_user_ids)) {
                logger.debug(`Duty ${currentDuty.user_id} (${dutyUserId}) is in exclusion list, skipping tag`);
                continue;
            }

            // Формируем контекст для обработчиков тегов
            const tagContext = {
                currentDuty,
                channelId: setting.channel_id,
                excludedUserIds: setting.excluded_user_ids
            };

            // Обрабатываем шаблон сообщения, заменяя все теги
            const messageTemplate = setting.message_template || '{duty_mention}';
            const mentionMessage = await processMessageTemplate(messageTemplate, tagContext);

            // Тэгаем дежурного в треде
            await postMessageInTreed(post.id, mentionMessage);

            logger.debug(`Tagged duty ${currentDuty.user_id} in thread ${post.root_id} for tag ${setting.tag} with template: ${messageTemplate}`);

            // Обрабатываем только первое совпадение, чтобы не тэгать несколько раз
            break;
        }
    } catch (error) {
        logger.error(`Error in handleDutyTagging: ${error.message}\nStack trace:\n${error.stack}`);
    }
};

