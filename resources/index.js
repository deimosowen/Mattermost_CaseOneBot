const fs = require('fs');
const path = require('path');

function loadResources() {
    const defaultResources = require('./resources.json');
    let mergedResources = { ...defaultResources };

    try {
        const productionResourcesPath = path.join(__dirname, './resources.prod.json');
        if (fs.existsSync(productionResourcesPath)) {
            const productionResources = require(productionResourcesPath);
            for (let key in productionResources) {
                mergedResources[key] = { ...defaultResources[key], ...productionResources[key] };
            }
        }
    } catch (error) {
        console.error('Ошибка при загрузке resources.prod.json:', error);
    }

    return mergedResources;
}

module.exports = loadResources();