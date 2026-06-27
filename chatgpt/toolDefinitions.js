/**
 * Преобразует внутренние описания функций в формат tools для Responses API.
 */
function buildTools(functionDefinitions) {
    return functionDefinitions.map(({ name, description, parameters }) => ({
        type: 'function',
        name,
        description,
        parameters: parameters || { type: 'object', properties: {} },
        strict: false,
    }));
}

module.exports = {
    buildTools,
};
