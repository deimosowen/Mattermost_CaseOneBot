const winston = require('winston');
require('winston-daily-rotate-file');

const transport = new (winston.transports.DailyRotateFile)({
    filename: 'logs/%DATE%-app.log', // Формат имени файла. %DATE% заменяется датой.
    datePattern: 'YYYY-MM-DD',       // Формат даты в имени файла.
    zippedArchive: false,            // Архивировать старые логи.
    maxSize: '20m',                  // Размер одного файла.
    maxFiles: '14d'                  // Хранить файлы в течение 14 дней.
});

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss UTC' }),
        winston.format.printf(info => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`)
    ),
    transports: [
        new winston.transports.Console(),
        transport
    ]
});

module.exports = logger;