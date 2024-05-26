const path = require('path');
const fs = require('fs');

const configPath = path.resolve(__dirname, 'database.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

module.exports = {
    getDatabasePath: function () {
        return path.resolve(__dirname, '..', config.development.filename);
    },
    getConfig: function () {
        return config;
    }
};