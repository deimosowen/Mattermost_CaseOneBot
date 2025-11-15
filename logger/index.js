const winston = require('winston');
require('winston-daily-rotate-file');

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = isProduction ? 'info' : 'debug';

const transport = new (winston.transports.DailyRotateFile)({
    filename: 'logs/%DATE%-app.log', // Формат имени файла. %DATE% заменяется датой.
    datePattern: 'YYYY-MM-DD',       // Формат даты в имени файла.
    zippedArchive: false,            // Архивировать старые логи.
    maxSize: '20m',                  // Размер одного файла.
    maxFiles: '14d',                 // Хранить файлы в течение 14 дней.
    level: logLevel                  // Уровень логирования для файла
});

// Консольный транспорт с тем же уровнем
const consoleTransport = new winston.transports.Console({
    level: logLevel,
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    )
});

const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss UTC' }),
        winston.format.printf(info => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`)
    ),
    transports: [
        consoleTransport,
        transport
    ]
});

module.exports = logger;