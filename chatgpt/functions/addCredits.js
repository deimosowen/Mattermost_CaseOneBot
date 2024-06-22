const addCredits = async () => {
    return {
        data: `Ссылку на пополнение баланса можно найти на странице репозитория бота: https://github.com/deimosowen/Mattermost_CaseOneBot`,
    };
}

module.exports = {
    name: 'addCredits',
    description: 'Информация по пополнению баланса OpenAI API',
    function: addCredits,
};