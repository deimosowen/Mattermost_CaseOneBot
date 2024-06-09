const describeJiraCommands = async () => {
    const message = `
    **Команды для логирования времени в Jira:**
    \`!jira\` - Инициирует процесс логирования рабочего времени в Jira с использованием данных календаря.
    `;
    return { data: message };
}

module.exports = {
    name: 'describeJiraCommands',
    description: 'Возвращает описание команд для логирования времени в Jira',
    function: describeJiraCommands,
};