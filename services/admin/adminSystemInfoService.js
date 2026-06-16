const fs = require('fs');
const { getDatabasePath } = require('../../db/config');
const logger = require('../../logger');

function getDatabaseInfo() {
    const dbPath = getDatabasePath();
    const dbInfo = { size: null };

    try {
        if (fs.existsSync(dbPath)) {
            dbInfo.size = fs.statSync(dbPath).size;
        }
    } catch (error) {
        logger.warn('Could not get database info:', error);
    }

    return dbInfo;
}

function getSystemInfo() {
    return {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: getDatabaseInfo(),
        timestamp: new Date().toISOString(),
    };
}

module.exports = {
    getSystemInfo,
};
