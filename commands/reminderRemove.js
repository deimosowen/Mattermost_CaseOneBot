const { deleteReminder } = require('../db/models/reminders');
const { cancelCronJob } = require('../cron');
const { postMessageInTreed } = require('../mattermost/utils');
const logger = require('../logger');
const TaskType = require('../types/taskTypes');

module.exports = async ({ post_id, channel_id, user_id, args }) => {
    const [id] = args;

    if (!id) {
        postMessageInTreed(post_id, 'Ошибка: не указан ID напоминания.');
        return;
    }

    try {
        const changes = await deleteReminder(id, channel_id, user_id);

        if (changes > 0) {
            cancelCronJob(id, TaskType.REMINDER);
            postMessageInTreed(post_id, `Напоминание \`${id}\` успешно удалено.`);
        } else {
            postMessageInTreed(post_id, `Не удалось найти напоминание \`${id}\` для удаления.`);
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
};