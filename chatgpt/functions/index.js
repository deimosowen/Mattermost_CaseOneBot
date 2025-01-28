const fs = require('fs');
const path = require('path');
const { FunctionAdapterFactory } = require('./functionAdapters');
const OpenAIClientFactory = require('../openAIClientFactory');

class FunctionRegistry {
    constructor(model) {
        this.adapter = FunctionAdapterFactory.createAdapter(model);
        this.functions = [];
        this.loadFunctions();
    }

    loadFunctions() {
        const functionsPath = __dirname;
        const files = fs.readdirSync(functionsPath);

        files.forEach(file => {
            if (file.endsWith('.js') && !['index.js', 'functionAdapters.js', 'baseFunction.js'].includes(file)) {
                const funcModule = require(path.join(functionsPath, file));
                this.functions.push(this.adapter.adapt(funcModule));
            }
        });
    }

    getFunctions() {
        return this.functions;
    }
}

let functionRegistry = null;

function getFunctions(model = OpenAIClientFactory.getModel()) {
    if (!functionRegistry || functionRegistry.model !== model) {
        functionRegistry = new FunctionRegistry(model);
    }
    return functionRegistry.getFunctions();
}

module.exports = {
    functions: getFunctions(),
    getFunctions
};