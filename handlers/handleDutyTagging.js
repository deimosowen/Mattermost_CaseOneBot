const { postMessageInTreed, getChannelById, getUserByUsername } = require('../mattermost/utils');
const { getAllActiveDutyTagSettings, getCurrentDuty } = require('../db/models/duty');
const logger = require('../logger');

module.exports = async (post, eventData) => {
    try {
        if (post.props?.from_bot) {
            return;
        }

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

            // Получаем user ID дежурного для проверки исключений
            let dutyUserId = null;
            try {
                const username = currentDuty.user_id.startsWith('@')
                    ? currentDuty.user_id.substring(1)
                    : currentDuty.user_id;
                const dutyUser = await getUserByUsername(username);
                if (dutyUser) {
                    dutyUserId = dutyUser.id;
                }
            } catch (error) {
                logger.warn(`Could not get user ID for duty ${currentDuty.user_id}:`, error);
            }

            // Проверяем, находится ли дежурный в списке исключений
            if (dutyUserId && setting.excluded_user_ids && Array.isArray(setting.excluded_user_ids)) {
                if (setting.excluded_user_ids.includes(dutyUserId)) {
                    logger.debug(`Duty ${currentDuty.user_id} (${dutyUserId}) is in exclusion list, skipping tag`);
                    continue;
                }
            }

            // Формируем сообщение из шаблона
            const messageTemplate = setting.message_template || '{duty_mention}';
            const mentionMessage = messageTemplate.replace(/{duty_mention}/g, currentDuty.user_id);

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

