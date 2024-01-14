const cronValidator = require('cron-validator');
const { addReminder } = require('../db/models/reminders');
const { setCronJob } = require('../cron');
const { postMessage, postMessageInTreed } = require('../mattermost/utils');
const TaskType = require('../types/taskTypes');

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
    const taskCallback = () => postMessage(channel_id, message);
    const task = setCronJob(id, schedule, taskCallback, TaskType.REMINDER);
    const nextExecutionDate = task.nextDate().toFormat('yyyy-MM-dd HH:mm');
    postMessageInTreed(post_id, `Успешно добавлено. Следующее напоминание будет в ${nextExecutionDate} (UTC)`);
};