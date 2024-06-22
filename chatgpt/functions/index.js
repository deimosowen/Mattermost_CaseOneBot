const fs = require('fs');
const path = require('path');

const functionsPath = __dirname;
const functions = [];

const files = fs.readdirSync(functionsPath);

files.forEach(file => {
    if (file.endsWith('.js') && file !== 'index.js') {
        const funcModule = require(path.join(functionsPath, file));

        functions.push({
            name: funcModule.name,
            description: funcModule.description,
            function: funcModule.function,
            parameters: funcModule.parameters || { type: 'object', properties: {} },
        });
    }
});

module.exports = {
    functions,
};