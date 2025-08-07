function parseStandardCommand(message) {
    return message.split(';').map(part => part.trim());
}

function parseSpaceFirstSeparatedCommand(message) {
    //разделить сообщение по первому пробелу
    const parts = message.split(/\s+/);
    const command = parts.shift();
    const rest = parts.join(' ');
    return [command, rest];
}

function parseMeetCommand(message) {
    const parts = message.split(/\s+/);
    const command = parts.shift();
    const durationIndex = parts.findIndex(p => /^\d+(m|h)$/.test(p));
    const duration = durationIndex !== -1 ? parts.splice(durationIndex, 1)[0] : '15m';

    const userParts = parts.filter(p => p.startsWith('@'));
    const userString = userParts.join(', ');

    const remainingParts = parts.filter(p => !p.startsWith('@'));
    const summary = remainingParts.join(' ');

    return [command, userString, summary, duration];
}

function parseReviewCommand(message) {
    const parts = message.split(/\s+/);
    const command = parts.shift();

    const codePrefixes = ['CASEM', 'REN'];
    const codePattern = new RegExp(`^(${codePrefixes.join('|')})-\\d+$`);

    const codeIndex = parts.findIndex(part => codePattern.test(part));
    const taskCode = codeIndex !== -1 ? parts[codeIndex].match(codePattern)[0] : null;
    parts.splice(codeIndex, 1);

    const urlIndex = parts.findIndex(part => /^https?:\/\//.test(part));
    const prLink = urlIndex !== -1 ? parts[urlIndex] : null;

    const userMentions = parts.filter(p => p.startsWith('@'));
    const reviewer = userMentions.length > 0 ? userMentions[0] : null;

    return [command, taskCode, prLink, reviewer];
}

const commandParsers = {
    '!meet': parseMeetCommand,
    '!reop': parseSpaceFirstSeparatedCommand,
    '!review': parseReviewCommand
};

function parseCommand(message) {
    const command = message.split(/\s+/, 1)[0];
    const parser = commandParsers[command] || parseStandardCommand;
    return parser(message);
}

module.exports = {
    parseCommand
};
