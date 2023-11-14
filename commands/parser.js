function parseStandardCommand(message) {
    return message.split(';').map(part => part.trim());
}

function parseMeetCommand(message) {
    const parts = message.split(/\s+/);
    const command = parts.shift();
    const durationIndex = parts.findIndex(p => /^\d+(m|h)$/.test(p));
    const duration = durationIndex !== -1 ? parts.splice(durationIndex, 1)[0] : '15m';

    const userParts = parts.filter(p => p.startsWith('@'));
    const userString = userParts.join(', ');

    const summaryIndex = userParts.length > 0 ? parts.indexOf(userParts[0]) : parts.length;
    const summary = parts.slice(0, summaryIndex).join(' ');

    return [command, userString, summary, duration];
}

const commandParsers = {
    '!meet': parseMeetCommand,
};

function parseCommand(message) {
    const command = message.split(/\s+/, 1)[0];
    const parser = commandParsers[command] || parseStandardCommand;
    return parser(message);
}

module.exports = {
    parseCommand
};
