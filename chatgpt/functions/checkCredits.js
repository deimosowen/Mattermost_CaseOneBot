const openAiHelpers = require('../helpers');

const checkCredits = async () => {
    try {
        const result = await openAiHelpers.checkCredits();
        return {
            data: `Баланс: $${result.total_available}`,
        };
    } catch (error) {
        return {
            data: 'При проверке оставшегося баланса произошла ошибка',
        };
    }
}

module.exports = {
    name: 'checkCredits',
    description: 'Проверка оставшегося баланса OpenAI API',
    function: checkCredits,
};