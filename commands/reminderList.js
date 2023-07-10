const { getReminders } = require('../db/reminders');
const { postMessage } = require('../mattermost/utils');

module.exports = async ({ channel_id }) => {
    const reminders = await getReminders(channel_id);

    if (reminders.length === 0) {
        postMessage(channel_id, 'Нет активных напоминаний.');
        return;
    }

    let message = 'Список напоминаний:\n';

    reminders.forEach((reminder, i) => {
        message += `- ID: \`${reminder.id}\`, Расписание: \`${reminder.schedule}\`, Автор: ${reminder.user_name}, Сообщение: ${reminder.message}\n`;
    });

    postMessage(channel_id, message);
};