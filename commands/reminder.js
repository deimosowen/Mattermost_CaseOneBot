const cronValidator = require('cron-validator');
const { addReminder } = require('../db/models/reminders');
const { postMessageInTreed } = require('../mattermost/utils');
const cronManager = require('../cron/cronManager');
const CronServiceTypes = require('../cron/сronServiceTypes');

module.exports = async ({ post_id, channel_id, channel_name, user_id, user_name, args }) => {
    const [schedule, message] = args;

    if (!args[0]) {
        postMessageInTreed(post_id, 'Ошибка: параметр [cron-расписание] отсутствует.');
        return;
    }

    if (!cronValidator.isValidCron(schedule)) {
        postMessageInTreed(post_id, `Ошибка: параметр [cron-расписание] "${schedule}" является недопустимым.`);
        return;
    }

    if (!message) {
        postMessageInTreed(post_id, `Ошибка: сообщение отсутствует.`);
        return;
    }

    const id = await addReminder(channel_id, channel_name, user_id, user_name, schedule, message);
    const reminderService = cronManager.get(CronServiceTypes.REMINDER);
    const task = reminderService.addJob({ id, schedule, channel_id, message });
    const nextExecutionDate = task.nextDate().toFormat('yyyy-MM-dd HH:mm');
    postMessageInTreed(post_id, `Успешно добавлено. Следующее напоминание будет в ${nextExecutionDate} (UTC)`);
};