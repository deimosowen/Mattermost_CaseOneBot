class BaseFunctionAdapter {
    adapt(funcModule) {
        throw new Error('Must be implemented');
    }
}

class GPTFunctionAdapter extends BaseFunctionAdapter {
    adapt(funcModule) {
        return {
            name: funcModule.name,
            description: funcModule.description,
            function: funcModule.function,
            parameters: funcModule.parameters || { type: 'object', properties: {} },
            returns: funcModule.returns || {}
        };
    }
}

class DeepseekFunctionAdapter extends BaseFunctionAdapter {
    adapt(funcModule) {
        return {
            name: funcModule.name,
            description: funcModule.description,
            function: funcModule.function,
            parameters: funcModule.parameters || { type: 'object', properties: {} },
            returns: funcModule.returns || {},
            required: funcModule.required || []
        };
    }
}

class FunctionAdapterFactory {
    static createAdapter(model) {
        if (model.startsWith('deepseek-')) {
            return new DeepseekFunctionAdapter();
        }
        return new GPTFunctionAdapter();
    }
}

module.exports = { FunctionAdapterFactory }; 