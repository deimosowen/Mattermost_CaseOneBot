const fs = require('fs');
const path = require('path');
const { postMessage, postMessageInTreed, uploadFile, getMe, createDirectChannel } = require('../mattermost/utils');
const { ADMIN_ID } = require('../config');
const logger = require('../logger');

/**
 * Находит последний файл лога
 */
function getLatestLogFile() {
    const logsDir = path.join(__dirname, '../logs');
    
    if (!fs.existsSync(logsDir)) {
        return null;
    }
    
    const files = fs.readdirSync(logsDir)
        .filter(file => file.endsWith('.log'))
        .map(file => ({
            name: file,
            path: path.join(logsDir, file),
            mtime: fs.statSync(path.join(logsDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);
    
    return files.length > 0 ? files[0] : null;
}

/**
 * Отправляет файл лога в Mattermost
 */
module.exports = async ({ post_id, channel_id, user_id, channel_type }) => {
    try {
        const replyToSource = async (message) => {
            if (channel_type === 'D' && post_id) {
                return postMessageInTreed(post_id, message);
            }
            return postMessage(channel_id, message);
        };

        if (!ADMIN_ID || ADMIN_ID !== user_id) {
            await replyToSource('Команда доступна только администратору.');
            return;
        }

        const latestLog = getLatestLogFile();
        
        if (!latestLog) {
            await replyToSource('Логи не найдены');
            return;
        }
        
        // Читаем файл лога
        const logContent = fs.readFileSync(latestLog.path);
        const logFileName = latestLog.name;
        
        // Определяем, куда отправлять
        const wasDirectRequest = channel_type === 'D';
        let targetChannelId = channel_id;
        
        // Если не личный канал, отправляем в личное сообщение
        if (!wasDirectRequest) {
            try {
                const bot = await getMe();
                const directChannel = await createDirectChannel([user_id, bot.id]);
                targetChannelId = directChannel.id;
            } catch (error) {
                logger.error(`Error creating direct channel: ${error.message}`);
                // Если не удалось создать личный канал, отправляем в текущий канал
                targetChannelId = channel_id;
            }
        }
        
        // Загружаем файл (используем Buffer напрямую)
        const uploadedFile = await uploadFile(logContent, logFileName, targetChannelId);
        
        if (!uploadedFile || !uploadedFile.file_infos || uploadedFile.file_infos.length === 0) {
            throw new Error('Не удалось загрузить файл лога');
        }
        
        const fileId = uploadedFile.file_infos[0].id;
        const message = `📋 Последний файл лога: \`${logFileName}\``;
        
        // Отправляем сообщение с файлом
        if (wasDirectRequest && post_id) {
            postMessageInTreed(post_id, message, [fileId]);
        } else {
            postMessage(targetChannelId, message, null, [fileId]);
        }
        
        logger.info(`Log file ${logFileName} sent to user ${user_id}`);
    } catch (error) {
        logger.error(`Error in log command: ${error.message}\nStack trace:\n${error.stack}`);
        
        const errorMessage = `Ошибка при отправке лога: ${error.message}`;
        if (channel_type === 'D' && post_id) {
            postMessageInTreed(post_id, errorMessage);
        } else {
            postMessage(channel_id, errorMessage);
        }
    }
};

