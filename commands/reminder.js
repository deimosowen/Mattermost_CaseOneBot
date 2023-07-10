const cronValidator = require('cron-validator');
const { addReminder } = require('../db/reminders');
const { setCronJob } = require('../cron');
const { postMessage } = require('../mattermost/utils');

module.exports = async ({ channel_id, channel_name, user_id, user_name, args }) => {
    const [schedule, message] = args;

    if (!args[0]) {
        postMessage(channel_id, 'Ошибка: параметр [cron-расписание] отсутствует.');
        return;
    }

    if (!cronValidator.isValidCron(schedule)) {
        postMessage(channel_id, `Ошибка: параметр [cron-расписание] "${schedule}" является недопустимым.`);
        return;
    }

    if (!message) {
        postMessage(channel_id, `Ошибка: сообщение отсутствует.`);
        return;
    }

    const id = await addReminder(channel_id, channel_name, user_id, user_name, schedule, message);
    const task = setCronJob(id, schedule, channel_id, message);
    const nextExecutionDate = task.nextDate().toFormat('yyyy-MM-dd HH:mm');
    postMessage(channel_id, `Успешно добавлено. Следующее напоминание будет в ${nextExecutionDate} (UTC)`);
};