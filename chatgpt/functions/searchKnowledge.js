const knowledgeSearchService = require('../../services/knowledge/knowledgeSearchService');

const searchKnowledge = async ({ query, limit }) => {
    const result = await knowledgeSearchService.search(query, { limit });

    return {
        data: result,
    };
};

module.exports = {
    name: 'searchKnowledge',
    description: 'Ищет фактическую информацию во внутренней базе знаний. Используй для вопросов про регламенты, инструкции, процессы, настройки, договоренности, внутреннюю документацию и Confluence/wiki. Отвечай только по найденным результатам и указывай источники.',
    readOnly: true,
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Короткий поисковый запрос по сути вопроса без обращения к боту и лишнего текста',
            },
            limit: {
                type: 'number',
                description: 'Максимальное количество результатов. Обычно 3-5',
            },
        },
        required: ['query'],
    },
    function: searchKnowledge,
};
