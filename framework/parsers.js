// Разделение аргументов по ';' (по умолчанию).
// Пример: "!reminder; завтра 10:00; позвонить Васе" -> ["завтра 10:00", "позвонить Васе"]
function SEMICOLON(message) {
    const rest = message.replace(/^\S+/, '').trim();
    if (!rest) return [];
    return rest.split(';').map(s => s.trim()).filter(Boolean);
}

// Всё после первого пробела — единая строка.
// Пример: "!invite @user" -> ["@user"]
function FIRST_REST(message) {
    const rest = message.replace(/^\S+/, '').trim();
    return rest ? [rest] : [];
}

// Парсер для "!meet" (либо алиасов):
// "!meet @u1 @u2 планирование 30m" -> ["@u1, @u2", "планирование", "30m"]
function MEET(message) {
    const parts = message.trim().split(/\s+/);
    parts.shift(); // убрать саму команду

    const durationIndex = parts.findIndex(p => /^\d+(m|h)$/i.test(p));
    const duration = durationIndex !== -1 ? (parts.splice(durationIndex, 1)[0].toLowerCase()) : '15m';

    const users = parts.filter(p => p.startsWith('@'));
    const userString = users.join(', ');

    const summary = parts.filter(p => !p.startsWith('@')).join(' ');
    return [userString, summary, duration];
}

// Парсер для "!review":
// "!review CASEM-123 https://... @reviewer" -> ["CASEM-123", "https://...", "@reviewer"]
function REVIEW(message) {
    const parts = message.trim().split(/\s+/);
    parts.shift(); // убрать команду

    const codePrefixes = ['CASEM', 'REN'];
    const codePattern = new RegExp(`^(${codePrefixes.join('|')})-\\d+$`, 'i');

    const codeIndex = parts.findIndex(p => codePattern.test(p));
    const taskCode = codeIndex !== -1 ? parts.splice(codeIndex, 1)[0] : null;

    const urlIndex = parts.findIndex(p => /^https?:\/\//i.test(p));
    const prLink = urlIndex !== -1 ? parts.splice(urlIndex, 1)[0] : null;

    const reviewer = parts.find(p => p.startsWith('@')) || null;
    return [taskCode, prLink, reviewer];
}

const ParserId = Object.freeze({
    SEMICOLON: 'SEMICOLON',
    FIRST_REST: 'FIRST_REST',
    MEET: 'MEET',
    REVIEW: 'REVIEW',
});

// --- реестр id → функция ---
const Parsers = Object.freeze({
    [ParserId.SEMICOLON]: SEMICOLON,
    [ParserId.FIRST_REST]: FIRST_REST,
    [ParserId.MEET]: MEET,
    [ParserId.REVIEW]: REVIEW,
});

// Унифицированный резолвер: принимает enum-id или функцию
function resolveParser(parser) {
    if (!parser) return null;
    if (typeof parser === 'function') return parser;
    return Parsers[parser] || null;
}

module.exports = { ParserId, Parsers, resolveParser };