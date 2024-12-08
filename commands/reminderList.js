const { getReminders } = require('../db/models/reminders');
const { postMessageInTreed } = require('../mattermost/utils');

module.exports = async ({ post_id, channel_id }) => {
    const reminders = await getReminders(channel_id);

    if (reminders.length === 0) {
        postMessageInTreed(post_id, 'Нет активных напоминаний.');
        return;
    }

    let message = 'Список напоминаний:\n';

    reminders.forEach((reminder, i) => {
        message += `- ID: \`${reminder.id}\`, Расписание: \`${reminder.schedule}\`, Автор: ${reminder.user_name}, Сообщение: ${reminder.message}\n`;
    });

    postMessageInTreed(post_id, message);
};