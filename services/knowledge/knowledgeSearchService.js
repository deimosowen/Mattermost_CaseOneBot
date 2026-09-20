const confluenceSource = require('./confluenceSource');
const { KNOWLEDGE_SEARCH_LIMIT } = require('../../config');

const sources = [
    confluenceSource,
];

async function search(query, options = {}) {
    const normalizedQuery = String(query || '').trim();
    const limit = options.limit || KNOWLEDGE_SEARCH_LIMIT;

    if (!normalizedQuery) {
        return {
            query: normalizedQuery,
            results: [],
            message: 'Пустой поисковый запрос',
        };
    }

    const sourceResults = await Promise.all(
        sources.map((source) => source.search(normalizedQuery, { limit }))
    );

    const configuredSources = sourceResults.filter((result) => result.configured);
    const errors = sourceResults
        .map((result) => result.error)
        .filter(Boolean);
    const results = sourceResults
        .flatMap((result) => result.results || [])
        .slice(0, limit);

    if (configuredSources.length === 0) {
        return {
            query: normalizedQuery,
            results: [],
            message: 'Поиск по базе знаний не настроен',
        };
    }

    return {
        query: normalizedQuery,
        results,
        errors,
        message: results.length > 0 ? undefined : 'По базе знаний ничего не найдено',
    };
}

module.exports = {
    search,
};
