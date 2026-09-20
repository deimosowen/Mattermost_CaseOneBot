const { ACTION_FUNCTIONS } = require('./functionGroups');

function buildDescription(func) {
    const description = func.description || '';
    if (!ACTION_FUNCTIONS.has(func.name)) {
        return description;
    }

    return `${description} Важно: функция меняет состояние внешних систем или память бота. Вызывай только если пользователь явно попросил это действие.`;
}

function buildTools(functionDefinitions) {
    return functionDefinitions.map((func) => ({
        type: 'function',
        name: func.name,
        description: buildDescription(func),
        parameters: func.parameters || { type: 'object', properties: {} },
        strict: false,
    }));
}

module.exports = {
    buildTools,
    _private: {
        buildDescription,
    },
};
