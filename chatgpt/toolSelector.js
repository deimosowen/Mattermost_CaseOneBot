const { GROUP_FUNCTIONS, REQUIRES_POST, FALLBACK_GROUPS } = require('./functionGroups');

/**
 * Правила: группа + паттерны. Несколько совпадений увеличивают score группы.
 */
const GROUP_RULES = [
    {
        group: 'duty',
        patterns: [
            /дежур/i,
            /duty/i,
            /on-?call/i,
            /онколл/i,
            /дежурн/i,
            /ротац/i,
            /rotate/i,
            /смен[аыу]/i,
            /кто\s+(сегодня|сейчас|там)/i,
            /на\s+прод/i,
            /\bпрод[еу]?\b/i,
            /\bprod\b/i,
            /production/i,
            /стенд/i,
            /окружен/i,
        ],
    },
    {
        group: 'calendar',
        patterns: [
            /календар/i,
            /calendar/i,
            /встреч/i,
            /созвон/i,
            /мит\b/i,
            /\bmeet\b/i,
            /google\s*meet/i,
            /слот/i,
            /свободн/i,
            /окно/i,
            /отпуск/i,
            /отгу/i,
            /больнич/i,
            /отсутств/i,
            /absent/i,
            /availability/i,
            /событи/i,
            /запланир/i,
            /расписан/i,
        ],
    },
    {
        group: 'jira',
        patterns: [
            /jira/i,
            /джира/i,
            /in\s*review/i,
            /ин\s*ревью/i,
            /ревьювер/i,
            /ревьюер/i,
            /reviewer/i,
            /смен.{0,12}ревью/i,
            /назнач.{0,12}ревью/i,
            /\breop\b/i,
            /реоп/i,
            /переоткр/i,
            /верн.{0,12}(todo|to\s*do|ту\s*ду|доработ)/i,
            /на\s+доработ/i,
            /merge\s*request/i,
            /\bmr\b/i,
            /case[a-z]?-\d+/i,
            /worklog/i,
            /темпо/i,
            /логир.{0,6}врем/i,
            /задач[аиуе]/i,
            /тикет/i,
        ],
    },
    {
        group: 'invite',
        patterns: [
            /приглас/i,
            /\binvite\b/i,
            /добав.{0,6}канал/i,
            /в\s+канал/i,
            /приватн/i,
            /доступ\s+к\s+канал/i,
        ],
    },
    {
        group: 'media',
        patterns: [
            /нарисуй/i,
            /картин/i,
            /\bimage\b/i,
            /dall-?e/i,
            /сгенерир/i,
            /изображен/i,
            /рисунок/i,
            /иллюстрац/i,
        ],
    },
    {
        group: 'thread',
        patterns: [
            /тред/i,
            /\bthread\b/i,
            /обсужден/i,
            /в\s+треде/i,
            /что\s+писали/i,
            /история\s+сообщ/i,
            /переписк/i,
        ],
    },
    {
        group: 'help',
        patterns: [
            /помощь/i,
            /\bhelp\b/i,
            /команд/i,
            /как\s+(сделать|использовать|настроить)/i,
            /что\s+ты\s+умеешь/i,
            /возможност/i,
            /инструкц/i,
            /список\s+команд/i,
        ],
    },
    {
        group: 'forwarding',
        patterns: [
            /пересыл/i,
            /\bforward/i,
            /forwarding/i,
            /перенаправ/i,
        ],
    },
];

const GREETING_ONLY_PATTERN = /^(привет|здравств|добрый|hi|hello|hey|салют|хай)[!.?\s]*$/i;

function extractTextFromUserMessage(message) {
    if (typeof message.content === 'string') {
        return message.content;
    }

    if (Array.isArray(message.content)) {
        const textPart = message.content.find((part) => part.type === 'text');
        return textPart?.text || '';
    }

    return '';
}

function extractQuestionFromPrompt(text) {
    const match = text.match(/пишет:\s*(.+)$/is);
    return match ? match[1].trim() : text;
}

function collectRecentUserTexts(history, currentText) {
    const texts = [];

    for (const message of history) {
        if (message.role !== 'user') {
            continue;
        }
        const text = extractTextFromUserMessage(message);
        if (text) {
            texts.push(extractQuestionFromPrompt(text));
        }
    }

    if (currentText) {
        texts.push(extractQuestionFromPrompt(currentText));
    }

    return texts;
}

function scoreGroups(text) {
    const scores = {};

    for (const { group, patterns } of GROUP_RULES) {
        let score = 0;
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                score += 1;
            }
        }
        if (score > 0) {
            scores[group] = score;
        }
    }

    return scores;
}

function selectGroupsFromScores(scores, { isGreetingOnly }) {
    const groups = new Set(['core']);

    for (const [group, score] of Object.entries(scores)) {
        if (score > 0) {
            groups.add(group);
        }
    }

    if (groups.size === 1 && !isGreetingOnly) {
        for (const group of FALLBACK_GROUPS) {
            groups.add(group);
        }
    }

    return [...groups];
}

function selectToolGroups({ history = [], selectionText = '', hasPost = true, hasImage = false } = {}) {
    const recentTexts = collectRecentUserTexts(history, selectionText);
    const combinedText = recentTexts.slice(-3).join('\n');
    const currentText = recentTexts[recentTexts.length - 1] || '';
    const scores = scoreGroups(combinedText);

    if (hasImage) {
        scores.media = (scores.media || 0) + 2;
    }

    const isGreetingOnly = GREETING_ONLY_PATTERN.test(currentText.trim()) && Object.keys(scores).length === 0;

    let groups = selectGroupsFromScores(scores, { isGreetingOnly });

    if (!hasPost) {
        groups = groups.filter((group) => group !== 'invite' && group !== 'thread' && group !== 'jira' && group !== 'media');
    }

    return {
        groups,
        scores,
        combinedText,
    };
}

function getFunctionNamesForGroups(groups) {
    const names = new Set();

    for (const group of groups) {
        const groupFunctions = GROUP_FUNCTIONS[group] || [];
        for (const name of groupFunctions) {
            names.add(name);
        }
    }

    return names;
}

function selectFunctions(allFunctions, options = {}) {
    const { groups } = selectToolGroups(options);
    const names = getFunctionNamesForGroups(groups);
    const hasPost = options.hasPost ?? true;

    return allFunctions.filter((func) => {
        if (!names.has(func.name)) {
            return false;
        }
        if (!hasPost && REQUIRES_POST.has(func.name)) {
            return false;
        }
        return true;
    });
}

module.exports = {
    selectToolGroups,
    selectFunctions,
    getFunctionNamesForGroups,
};
