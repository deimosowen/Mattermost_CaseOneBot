const { postMessageInTreed } = require('../../mattermost/utils');
const reviewDistributionService = require('../../services/reviewDistributionService');
const {
    addReviewerToQueue,
    getReviewQueue,
    removeReviewerFromQueue,
    clearReviewQueue,
    updateReviewQueueOrder
} = require('../../db/models/reviewQueue');
const { getChannelMembers, getUserByUsername } = require('../../mattermost/utils');
const logger = require('../../logger');

module.exports = async ({ channel_id, post_id, args }) => {
    try {
        const [action, ...params] = args;

        switch (action) {
            case 'enable':
                return await _enableAutoDistribution(channel_id, post_id, params);
            case 'disable':
                return await _disableAutoDistribution(channel_id, post_id);
            case 'status':
                return await _showStatus(channel_id, post_id);
            case 'add':
                return await _addReviewer(channel_id, post_id, params);
            case 'remove':
                return await _removeReviewer(channel_id, post_id, params);
            case 'list':
                return await _listReviewers(channel_id, post_id);
            case 'clear':
                return await _clearQueue(channel_id, post_id);
            case 'help':
            default:
                return await _showHelp(post_id);
        }
    } catch (error) {
        logger.error(`[ReviewSettingsCommand] Ошибка выполнения команды: ${error.message}`);
        await postMessageInTreed(post_id, '❌ Произошла ошибка при выполнении команды.');
    }
}

async function _enableAutoDistribution(channel_id, post_id, params) {
    const reviewType = params[0] || 'queue';

    if (!['manual', 'queue'].includes(reviewType)) {
        await postMessageInTreed(post_id, '❌ Неверный тип ревью. Доступные типы: `manual`, `queue`');
        return;
    }

    const success = await reviewDistributionService.enableAutoDistribution(channel_id, reviewType);

    if (success) {
        const typeText = reviewType === 'queue' ? 'по очереди' : 'ручное';
        await postMessageInTreed(post_id, `✅ Автоматическое распределение ревьюеров включено (тип: ${typeText})`);
    } else {
        await postMessageInTreed(post_id, '❌ Ошибка при включении автоматического распределения');
    }
}

async function _disableAutoDistribution(channel_id, post_id) {
    const success = await reviewDistributionService.disableAutoDistribution(channel_id);

    if (success) {
        await postMessageInTreed(post_id, '✅ Автоматическое распределение ревьюеров отключено');
    } else {
        await postMessageInTreed(post_id, '❌ Ошибка при отключении автоматического распределения');
    }
}

async function _showStatus(channel_id, post_id) {
    const settings = await reviewDistributionService.getChannelSettings(channel_id);

    if (!settings) {
        await postMessageInTreed(post_id, '📋 Настройки ревью для канала не найдены');
        return;
    }

    const status = settings.is_enabled ? '✅ Включено' : '❌ Отключено';
    const type = settings.review_type === 'queue' ? 'по очереди' : 'ручное';

    let message = `📋 **Настройки ревью для канала:**\n`;
    message += `• Статус: ${status}\n`;
    message += `• Тип: ${type}\n`;

    if (settings.review_type === 'queue') {
        const reviewers = await getReviewQueue(channel_id);
        message += `• Ревьюеров в очереди: ${reviewers.length}\n`;

        if (reviewers.length > 0) {
            message += `• Список ревьюеров:\n`;
            reviewers.forEach((reviewer, index) => {
                const status = reviewer.is_disabled ? '🚫 (в отпуске)' : '✅';
                message += `  ${index + 1}. @${reviewer.user_name} ${status}\n`;
            });
        }
    }

    await postMessageInTreed(post_id, message);
}

async function _addReviewer(channel_id, post_id, params) {
    if (params.length === 0) {
        await postMessageInTreed(post_id, '❌ Укажите имя пользователя для добавления в очередь ревьюеров');
        return;
    }

    const username = params[0].replace('@', '');

    try {
        const user = await getUserByUsername(username);
        if (!user) {
            await postMessageInTreed(post_id, `❌ Пользователь @${username} не найден`);
            return;
        }

        // Получаем текущую очередь для определения следующего номера
        const currentQueue = await getReviewQueue(channel_id);
        const nextOrder = currentQueue.length;

        await addReviewerToQueue(channel_id, user.id, user.username, nextOrder);
        await postMessageInTreed(post_id, `✅ Пользователь @${username} добавлен в очередь ревьюеров`);
    } catch (error) {
        logger.error(`[ReviewSettingsCommand] Ошибка добавления ревьюера: ${error.message}`);
        await postMessageInTreed(post_id, `❌ Ошибка при добавлении пользователя @${username}`);
    }
}

async function _removeReviewer(channel_id, post_id, params) {
    if (params.length === 0) {
        await postMessageInTreed(post_id, '❌ Укажите ID ревьюера для удаления из очереди');
        return;
    }

    const reviewerId = parseInt(params[0]);

    if (isNaN(reviewerId)) {
        await postMessageInTreed(post_id, '❌ ID ревьюера должен быть числом');
        return;
    }

    const result = await removeReviewerFromQueue(reviewerId, channel_id);

    if (result > 0) {
        await postMessageInTreed(post_id, `✅ Ревьюер с ID ${reviewerId} удален из очереди`);
    } else {
        await postMessageInTreed(post_id, `❌ Ревьюер с ID ${reviewerId} не найден в очереди`);
    }
}

async function _listReviewers(channel_id, post_id) {
    const reviewers = await getReviewQueue(channel_id);

    if (reviewers.length === 0) {
        await postMessageInTreed(post_id, '📋 Очередь ревьюеров пуста');
        return;
    }

    let message = `📋 **Очередь ревьюеров:**\n`;
    reviewers.forEach((reviewer, index) => {
        const status = reviewer.is_disabled ? '🚫 (в отпуске)' : '✅';
        message += `${index + 1}. ID: ${reviewer.id} - @${reviewer.user_name} ${status}\n`;
    });

    await postMessageInTreed(post_id, message);
}

async function _clearQueue(channel_id, post_id) {
    const result = await clearReviewQueue(channel_id);
    await postMessageInTreed(post_id, `✅ Очередь ревьюеров очищена (удалено: ${result} записей)`);
}

async function _showHelp(post_id) {
    const helpMessage = `📋 **Команды управления настройками ревью:**

\`!review-settings enable [manual|queue]\` - Включить автоматическое распределение
\`!review-settings disable\` - Отключить автоматическое распределение
\`!review-settings status\` - Показать текущие настройки
\`!review-settings add @username\` - Добавить пользователя в очередь ревьюеров
\`!review-settings remove <id>\` - Удалить ревьюера из очереди по ID
\`!review-settings list\` - Показать очередь ревьюеров
\`!review-settings clear\` - Очистить очередь ревьюеров

**Типы ревью:**
• \`manual\` - Ручное назначение (по умолчанию)
• \`queue\` - Автоматическое распределение по очереди

**Примеры:**
\`!review-settings enable queue\` - Включить распределение по очереди
\`!review-settings add @john.doe\` - Добавить пользователя в очередь`;

    await postMessageInTreed(post_id, helpMessage);
}