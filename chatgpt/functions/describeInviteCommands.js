const describeInviteCommands = async () => {
    const message = `
    **Команды для приглашения в канал:**
    \`!invite; [ссылка на канал/название канала]\` - Приглашает пользователя в указанный канал. Можно использовать либо ссылку на канал, либо его название. Примеры:
    - Использование названия канала: \`!invite; general\`
    - Использование ссылки на канал: \`https://your-mattermost-server.com/teamname/channels/general\`

    Также можно воспользоваться командой \`!invite\` без параметров, чтобы получить ссылку на UI со списком доступных каналов для входа.
    `;
    return { data: message };
}

module.exports = {
    name: 'describeInviteCommands',
    description: 'Возвращает описание команд для приглашения в приватный канал',
    function: describeInviteCommands,
};