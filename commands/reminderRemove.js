const { deleteReminder } = require('../db/reminders');
const { cancelCronJob } = require('../cron');
const { postMessage } = require('../mattermost/utils');

module.exports = async ({ channel_id, user_id, args }) => {
    const [id] = args;

    if (!id) {
        postMessage(channel_id, 'Ошибка: не указан ID напоминания.');
        return;
    }

    try {
        const changes = await deleteReminder(id, channel_id, user_id);

        if (changes > 0) {
            cancelCronJob(id);
            postMessage(channel_id, `Напоминание \`${id}\` успешно удалено.`);
        } else {
            postMessage(channel_id, `Не удалось найти напоминание \`${id}\` для удаления.`);
        }
    } catch (err) {
        console.error(err.message);
    }
};