const path = require('path');
const fs = require('fs');

const LOGS_DIR = path.join(__dirname, '../logs');

function getTodayDir() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return path.join(LOGS_DIR, `${y}-${m}-${d}`);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Кастомный appender для log4js.
 * Путь к файлу резолвится при КАЖДОЙ записи — автоматическая ротация при смене дня.
 *
 * log4js подключает этот модуль по пути и вызывает:
 *   appenderModule.configure(config, layouts) → function(loggingEvent)
 */
module.exports.configure = function (config, layouts) {
    const filename = config.filename || 'app.log';
    const layoutFn = layouts.patternLayout(config.pattern || '%d{yyyy-MM-dd hh:mm:ss} %p: %m');
    const streams = {};

    return function (loggingEvent) {
        const dir = getTodayDir();
        ensureDir(dir);
        const filePath = path.join(dir, filename);

        if (!streams[filePath]) {
            for (const key of Object.keys(streams)) {
                if (key !== filePath) {
                    streams[key].end();
                    delete streams[key];
                }
            }
            streams[filePath] = fs.createWriteStream(filePath, { flags: 'a' });
        }

        streams[filePath].write(layoutFn(loggingEvent) + '\n');
    };
};
