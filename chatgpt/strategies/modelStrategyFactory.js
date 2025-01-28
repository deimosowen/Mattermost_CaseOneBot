const GPTModelStrategy = require('./gptModelStrategy');
const DeepseekModelStrategy = require('./deepseekModelStrategy');

class ModelStrategyFactory {
    static createStrategy(model) {
        if (model.startsWith('deepseek-')) {
            return new DeepseekModelStrategy();
        }
        return new GPTModelStrategy();
    }
}

module.exports = ModelStrategyFactory;