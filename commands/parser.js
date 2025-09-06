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
    const parts = message.trim().split(/\s+/);
    const command = parts.shift();

    const codePrefixes = ['CASEM', 'REN'];
    const codePattern = new RegExp(`^(?:${codePrefixes.join('|')})-\\d+$`, 'i');

    // 1) Код задачи
    let taskCode = null;
    const codeIndex = parts.findIndex(p => codePattern.test(p));
    if (codeIndex !== -1) {
        taskCode = parts[codeIndex].toUpperCase();
        parts.splice(codeIndex, 1); // удаляем только если нашли
    }

    // 2) PR/URL
    let prLink = null;
    let urlIndex = parts.findIndex(p => /^https?:\/\/\S+/i.test(p));
    if (urlIndex !== -1) {
        const m = parts[urlIndex].match(/^https?:\/\/\S+/i);
        prLink = m ? m[0] : null;
        parts.splice(urlIndex, 1); // исключаем из дальнейшего разбора
    }

    // 3) Ревьюверы: поддержка нескольких упоминаний и разделения запятыми
    const tokens = parts
        .flatMap(p => p.split(','))
        .map(t => t.trim())
        .filter(Boolean);

    const reviewers = Array.from(new Set(
        tokens.filter(t => /^@[\w.\-]+$/i.test(t))
    ));

    const reviewer = reviewers.length ? reviewers.join(' ') : null;

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
