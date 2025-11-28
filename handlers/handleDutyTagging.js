const { postMessageInTreed, getChannelById } = require('../mattermost/utils');
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

            // Тэгаем дежурного в треде
            const mentionMessage = `${currentDuty.user_id}`;
            await postMessageInTreed(post.id, mentionMessage);
            
            logger.info(`Tagged duty ${currentDuty.user_id} in thread ${post.root_id} for tag ${setting.tag}`);
            
            // Обрабатываем только первое совпадение, чтобы не тэгать несколько раз
            break;
        }
    } catch (error) {
        logger.error(`Error in handleDutyTagging: ${error.message}\nStack trace:\n${error.stack}`);
    }
};

