const OpenAIClientFactory = require('../../chatgpt/openAIClientFactory');
const { normalizeTestIdentity } = require('./testIdentity');
const logger = require('../../logger');

const FLAKY_HINTS = [
    /timeout/i,
    /timed out/i,
    /race/i,
    /deadlock/i,
    /connection/i,
    /network/i,
    /temporar/i,
    /random/i,
    /intermittent/i,
    /stale/i,
    /локально.*проходит/i,
    /периодически/i,
];

function classifyByHeuristics({ test, history = [], localEvents = [] }) {
    const statuses = [
        ...history.map((item) => item.status),
        ...localEvents.map((item) => item.status),
    ].filter(Boolean);
    const failures = statuses.filter((status) => String(status).toUpperCase() === 'FAILURE').length;
    const successes = statuses.filter((status) => String(status).toUpperCase() === 'SUCCESS').length;
    const details = `${test.details || ''}\n${test.stacktrace || ''}`;
    const hasFlakyHint = FLAKY_HINTS.some((pattern) => pattern.test(details));

    let confidence = 0.25;
    const reasons = [];

    if (failures >= 2) {
        confidence += 0.2;
        reasons.push('тест уже падал раньше');
    }
    if (successes > 0 && failures > 0) {
        confidence += 0.25;
        reasons.push('в истории есть и падения, и успешные прогоны');
    }
    if (hasFlakyHint) {
        confidence += 0.2;
        reasons.push('текст ошибки похож на нестабильное падение');
    }
    if (test.muted) {
        confidence += 0.15;
        reasons.push('тест уже отмечен в TeamCity как muted');
    }

    confidence = Math.min(confidence, 0.95);
    return {
        is_flaky: confidence >= 0.55,
        confidence,
        category: hasFlakyHint ? 'unstable_environment_or_timing' : 'unknown',
        reason: reasons.length ? reasons.join('; ') : 'недостаточно истории, эвристика дала низкую уверенность',
        human_summary: `${test.name}: ${reasons.join('; ') || 'явных признаков flaky пока мало'}`,
        test_identity: normalizeTestIdentity(test.name),
    };
}

async function classifyWithGpt(input) {
    if (!OpenAIClientFactory.isApiKeyExist()) {
        return null;
    }

    try {
        const client = OpenAIClientFactory.getClient();
        const model = OpenAIClientFactory.getModel();
        const response = await client.responses.create({
            model,
            store: false,
            instructions: [
                'Ты классифицируешь падение автотеста.',
                'Верни только JSON без markdown.',
                'Поля: is_flaky boolean, confidence number 0..1, category string, reason string, human_summary string.',
                'Не выдумывай Jira-задачи и не принимай решение о создании задачи.'
            ].join('\n'),
            input: JSON.stringify(input),
        });

        return JSON.parse(response.output_text || '{}');
    } catch (error) {
        logger.warn(`[FlakyTestClassifier] GPT classification failed: ${error.message}`);
        return null;
    }
}

async function classify(input) {
    const heuristic = classifyByHeuristics(input);
    const gpt = await classifyWithGpt({
        test: input.test,
        history: input.history,
        heuristic,
    });

    if (!gpt || typeof gpt.is_flaky !== 'boolean') {
        return heuristic;
    }

    return {
        ...heuristic,
        ...gpt,
        test_identity: heuristic.test_identity,
        confidence: Number(gpt.confidence ?? heuristic.confidence),
    };
}

module.exports = {
    classify,
    classifyByHeuristics,
};
