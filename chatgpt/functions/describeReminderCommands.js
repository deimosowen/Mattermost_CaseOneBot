const describeReminderCommands = async () => {
    const message = `
    **Команды для напоминаний:**
    \`!reminder; [cron-расписание]; [сообщение]\` - Устанавливает напоминание с указанным сообщением по cron-расписанию.
    \`!reminder-remove; [id]\` - Удаляет напоминание с указанным ID.
    \`!reminder-list\` - Отображает список всех установленных напоминаний.
    \`!reminder-help\` - Показывает все доступные команды для функционала напоминаний.
    `;
    return { data: message };
}

module.exports = {
    name: 'describeReminderCommands',
    description: 'Возвращает описание команд для напоминаний',
    function: describeReminderCommands,
};