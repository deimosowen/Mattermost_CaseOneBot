const log4js = require('log4js');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = isProduction ? 'info' : 'debug';

const MODULES = ['calendar', 'conflict', 'feature', 'gitlab', 'review'];

const appenders = {
    console: {
        type: 'console',
        layout: isProduction
            ? undefined
            : { type: 'pattern', pattern: '%[[%p]%] %m' },
    },
};

const categories = {
    default: { appenders: ['console'], level: logLevel },
};

// Общий лог — кастомный appender с динамическим путём
appenders.app = {
    type: path.join(__dirname, 'dynamicFileAppender'),
    filename: 'app.log',
    pattern: '%d{yyyy-MM-dd hh:mm:ss} %p: %m',
};
categories.default.appenders.push('app');

// Модульные логи
for (const mod of MODULES) {
    const key = `module_${mod}`;
    appenders[key] = {
        type: path.join(__dirname, 'dynamicFileAppender'),
        filename: `${mod}.log`,
        pattern: '%d{yyyy-MM-dd hh:mm:ss} %p: %m',
    };
    categories[`module.${mod}`] = { appenders: [key], level: logLevel };
}

log4js.configure({ appenders, categories });

const moduleLoggers = {};

/**
 * Возвращает дочерний логгер с меткой модуля.
 * Логи пишутся в общий logs/{date}/app.log + отдельный logs/{date}/{component}.log
 *
 * Использование:
 *   const log = require('./logger').child('calendar');
 *   log.info('Проверка событий');
 */
function createChildLogger(component) {
    if (!moduleLoggers[component]) {
        const catName = `module.${component}`;
        moduleLoggers[component] = log4js.getLogger(catName);
    }
    const modLogger = moduleLoggers[component];
    const mainLogger = log4js.getLogger();

    const child = {};
    for (const level of ['error', 'warn', 'info', 'debug', 'trace', 'fatal']) {
        child[level] = (msg, ...args) => {
            const prefixed = `[${component}] ${msg}`;
            mainLogger[level](prefixed, ...args);
            modLogger[level](prefixed, ...args);
        };
    }
    return child;
}

const logger = log4js.getLogger();
logger.child = createChildLogger;

module.exports = logger;
