const axios = require('axios');
const TurndownService = require('turndown');
const {
    CONFLUENCE_BASE_URL,
    CONFLUENCE_USERNAME,
    CONFLUENCE_API_TOKEN,
    CONFLUENCE_SPACE_KEYS,
} = require('../../config');
const logger = require('../../logger');

const DEFAULT_LIMIT = 5;
const REQUEST_TIMEOUT_MS = 8000;
const turndownService = new TurndownService();

function isConfigured() {
    return Boolean(CONFLUENCE_BASE_URL && CONFLUENCE_API_TOKEN);
}

function getBaseUrl() {
    return (CONFLUENCE_BASE_URL || '').replace(/\/+$/, '');
}

function getAuthHeaders() {
    if (CONFLUENCE_USERNAME) {
        const credentials = Buffer.from(`${CONFLUENCE_USERNAME}:${CONFLUENCE_API_TOKEN}`).toString('base64');
        return { Authorization: `Basic ${credentials}` };
    }

    return { Authorization: `Bearer ${CONFLUENCE_API_TOKEN}` };
}

function escapeCqlValue(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
}

function buildCql(query) {
    const clauses = [
        'type = page',
        `text ~ "${escapeCqlValue(query)}"`,
    ];

    if (CONFLUENCE_SPACE_KEYS.length > 0) {
        const spaces = CONFLUENCE_SPACE_KEYS
            .map((space) => `"${escapeCqlValue(space)}"`)
            .join(',');
        clauses.push(`space in (${spaces})`);
    }

    return clauses.join(' AND ');
}

function normalizeText(html) {
    if (!html) {
        return '';
    }

    return turndownService
        .turndown(html)
        .replace(/\s+/g, ' ')
        .trim();
}

function makeSnippet(text, maxLength = 700) {
    if (!text || text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength).trim()}...`;
}

function buildPageUrl(page) {
    const links = page?._links || {};
    if (links.base && links.webui) {
        return `${links.base}${links.webui}`;
    }
    if (links.webui) {
        return `${getBaseUrl()}${links.webui}`;
    }
    return getBaseUrl();
}

async function search(query, { limit = DEFAULT_LIMIT } = {}) {
    if (!isConfigured()) {
        return {
            configured: false,
            results: [],
        };
    }

    try {
        const response = await axios.get(`${getBaseUrl()}/rest/api/content/search`, {
            headers: {
                ...getAuthHeaders(),
                Accept: 'application/json',
            },
            params: {
                cql: buildCql(query),
                limit,
                expand: 'body.storage,version,space',
            },
            timeout: REQUEST_TIMEOUT_MS,
        });

        const results = (response.data?.results || []).map((page) => {
            const text = normalizeText(page.body?.storage?.value);
            return {
                source: 'confluence',
                title: page.title,
                url: buildPageUrl(page),
                space: page.space?.key,
                updatedAt: page.version?.when,
                snippet: makeSnippet(text),
            };
        }).filter((result) => result.title && result.url);

        return {
            configured: true,
            results,
        };
    } catch (error) {
        logger.error(`[Knowledge][Confluence] Search failed: ${error.message}`);
        return {
            configured: true,
            error: 'Ошибка поиска в Confluence',
            results: [],
        };
    }
}

module.exports = {
    search,
    _private: {
        buildCql,
        normalizeText,
        makeSnippet,
        isConfigured,
    },
};
