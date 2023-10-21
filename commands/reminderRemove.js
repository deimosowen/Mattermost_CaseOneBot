const { deleteReminder } = require('../db/models/reminders');
const { cancelCronJob } = require('../cron');
const { postMessage } = require('../mattermost/utils');
const logger = require('../logger');
const TaskType = require('../types/taskTypes');

module.exports = async ({ channel_id, user_id, args }) => {
    const [id] = args;

    if (!id) {
        postMessage(channel_id, 'Ошибка: не указан ID напоминания.');
        return;
    }

    try {
        const changes = await deleteReminder(id, channel_id, user_id);

        if (changes > 0) {
            cancelCronJob(id, TaskType.REMINDER);
            postMessage(channel_id, `Напоминание \`${id}\` успешно удалено.`);
        } else {
            postMessage(channel_id, `Не удалось найти напоминание \`${id}\` для удаления.`);
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};