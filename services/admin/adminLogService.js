const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../../logs');
const MAX_LOG_BYTES = 100 * 1024;
const MAX_LOG_LINES = 500;

function getAvailableDates() {
    if (!fs.existsSync(LOGS_DIR)) {
        return [];
    }

    return fs.readdirSync(LOGS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        .map((entry) => entry.name)
        .sort()
        .reverse();
}

function getModulesForDate(date) {
    const logDir = path.join(LOGS_DIR, date);
    if (!fs.existsSync(logDir)) {
        return [];
    }

    return fs.readdirSync(logDir)
        .filter((file) => file.endsWith('.log'))
        .map((file) => file.replace('.log', ''))
        .sort();
}

function readTail(filePath) {
    const stats = fs.statSync(filePath);
    if (stats.size <= MAX_LOG_BYTES) {
        return {
            stats,
            content: fs.readFileSync(filePath, 'utf8'),
        };
    }

    const buffer = Buffer.allocUnsafe(MAX_LOG_BYTES);
    let fd;
    try {
        fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, MAX_LOG_BYTES, stats.size - MAX_LOG_BYTES);
    } finally {
        if (fd !== undefined) {
            fs.closeSync(fd);
        }
    }

    return {
        stats,
        content: `... (показаны последние 100 KB из ${(stats.size / 1024).toFixed(2)} KB)\n\n${buffer.toString('utf8')}`,
    };
}

function getLogFilesMetadata() {
    const dates = getAvailableDates();
    const modules = new Set();

    for (const date of dates) {
        for (const moduleName of getModulesForDate(date)) {
            modules.add(moduleName);
        }
    }

    return {
        dates,
        modules: [...modules].sort(),
    };
}

function getLatestLog({ date, moduleName = 'app' } = {}) {
    if (!fs.existsSync(LOGS_DIR)) {
        return {
            error: 'Папка logs не найдена',
            logFile: null,
            logContent: null,
        };
    }

    const availableDates = getAvailableDates();
    if (availableDates.length === 0) {
        return {
            error: 'Лог-файлы не найдены',
            logFile: null,
            logContent: null,
        };
    }

    const targetDate = date && availableDates.includes(date) ? date : availableDates[0];
    const availableModules = getModulesForDate(targetDate);
    const logFileName = `${moduleName || 'app'}.log`;
    const logPath = path.join(LOGS_DIR, targetDate, logFileName);

    if (!fs.existsSync(logPath)) {
        return {
            error: `Лог-файл ${logFileName} не найден за ${targetDate}`,
            logFile: null,
            logContent: null,
            availableDates,
            currentDate: targetDate,
            currentModule: moduleName || 'app',
            availableModules,
        };
    }

    const { stats, content } = readTail(logPath);
    const lines = content.split('\n');

    return {
        logFile: logFileName,
        logPath,
        logSize: stats.size,
        logModified: stats.mtime.toISOString(),
        logContent: lines.slice(-MAX_LOG_LINES).join('\n'),
        totalLines: lines.length,
        showingLastLines: Math.min(MAX_LOG_LINES, lines.length),
        availableDates,
        currentDate: targetDate,
        currentModule: moduleName || 'app',
        availableModules,
    };
}

module.exports = {
    getLogFilesMetadata,
    getLatestLog,
};
