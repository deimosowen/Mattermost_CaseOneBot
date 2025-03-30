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

    let caseCode = null;
    const caseIndex = parts.findIndex(part => part.includes("CASEM"));
    if (caseIndex !== -1) {
        const match = parts[caseIndex].match(/CASEM-\d+/);
        if (match) {
            caseCode = match[0];
            parts.splice(caseIndex, 1);
        } else {
            throw new Error("Невозможно извлечь номер задачи");
        }
    } else {
        throw new Error("Задача не найдена");
    }

    let prLink = null;
    const urlIndex = parts.findIndex(part => /^https?:\/\//.test(part));
    if (urlIndex !== -1) {
        prLink = parts[urlIndex];
    }

    return [command, caseCode, prLink];
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
