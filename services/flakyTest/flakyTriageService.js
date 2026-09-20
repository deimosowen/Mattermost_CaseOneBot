const {
    FLAKY_TEST_MONITORING_ENABLED,
    FLAKY_STABILIZATION_TASK_KEY,
    FLAKY_MIN_CONFIDENCE,
    FLAKY_JIRA_PROJECT_KEY,
    FLAKY_JIRA_ISSUE_TYPE_ID,
    FLAKY_JIRA_EPIC_LINK_FIELD,
} = require('../../config');
const TeamCityService = require('../teamcityService');
const GitlabService = require('../gitlabService');
const JiraService = require('../jiraService');
const mattermost = require('../../mattermost/utils');
const gitlabModel = require('../../db/models/gitlab');
const { getReviewTaskByGitlabMergeRequestId } = require('../../db/models/reviewTask');
const { parseGitlabMrUrl } = require('../gitlabService/gitlabHelper');
const triageModel = require('../../db/models/flakyTestTriage');
const { isFlakyTestCheckEnabledForChannel } = require('../../db/models/reviewChannels');
const classifier = require('./flakyTestClassifier');
const jiraMatcher = require('./flakyJiraMatcher');
const { normalizeTestIdentity } = require('./testIdentity');
const logger = require('../../logger');

async function getMattermostPostReference(postId) {
    if (!postId) {
        return null;
    }

    const url = await mattermost.getPostPermalink(postId);

    return {
        postId,
        url,
    };
}

function appendExistingPromptLines(lines, existingPromptRefs) {
    const refs = [];
    const seen = new Set();

    for (const ref of existingPromptRefs) {
        if (!ref?.postId || seen.has(ref.postId)) {
            continue;
        }
        seen.add(ref.postId);
        refs.push(ref);
    }

    if (!refs.length) {
        return;
    }

    lines.push('Существующие вопросы:');
    for (const [index, ref] of refs.slice(0, 5).entries()) {
        const label = `вопрос ${index + 1}`;
        lines.push(ref.url ? `- [${label}](${ref.url})` : `- ${label}: ${ref.postId}`);
    }
    if (refs.length > 5) {
        lines.push(`- ещё ${refs.length - 5}`);
    }
}

function getShortTestName(testName) {
    const rawName = String(testName || '').trim();
    if (!rawName) {
        return 'unknown';
    }

    const nameWithoutSuite = rawName.includes(':')
        ? rawName.split(':').pop().trim()
        : rawName;
    const parts = nameWithoutSuite.split('.').filter(Boolean);

    return parts.length ? parts[parts.length - 1] : rawName;
}

async function buildJiraDescription(prompt) {
    const discussionRef = await getMattermostPostReference(prompt.prompt_post_id || prompt.post_id);
    const discussionLine = discussionRef?.url
        ? `Обсуждение: [Mattermost thread](${discussionRef.url})`
        : `Обсуждение: Mattermost thread ${discussionRef?.postId || prompt.post_id}`;

    return [
        `Плавающий тест: ${prompt.test_name}`,
        prompt.build_url ? `Build: ${prompt.build_url}` : null,
        prompt.classifier_summary ? `Причина: ${prompt.classifier_summary}` : null,
        '',
        discussionLine,
    ].filter(Boolean).join('\n');
}

function buildHasRevision(build, sha) {
    if (!sha) {
        return false;
    }
    const revisions = build.revisions || [];
    return revisions.some((revision) => String(revision).startsWith(String(sha)) || String(sha).startsWith(String(revision)));
}

function buildMatchesMr(build, mrInfo) {
    if (!build || !mrInfo) {
        return false;
    }
    if (build.branchName && mrInfo.source_branch && String(build.branchName).includes(String(mrInfo.source_branch))) {
        return true;
    }
    if (buildHasRevision(build, mrInfo.sourceSha)) {
        return true;
    }
    return false;
}

function getManualReviewTaskId(projectId, mrIid) {
    const numericProjectId = Math.abs(Number(projectId) || 0);
    const numericMrIid = Math.abs(Number(mrIid) || 0);
    return -1 * ((numericProjectId * 1000000) + numericMrIid);
}

async function resolveAuthorMention(context, mrInfo) {
    if (mrInfo?.authorUsername) {
        try {
            const user = await mattermost.getUserByUsername(mrInfo.authorUsername);
            if (user?.username) {
                return `@${user.username}`;
            }
        } catch {
            // fall back below
        }
    }

    if (context.author_user_id) {
        try {
            const user = await mattermost.getUser(context.author_user_id);
            if (user?.username) {
                return `@${user.username}`;
            }
        } catch {
            // fall through
        }
    }

    return mrInfo?.authorUsername ? `@${mrInfo.authorUsername}` : '';
}

function formatPrompt({ authorMention, test, build, classification, knownTask }) {
    const lines = [];
    const confidence = Math.round(Number(classification.confidence || 0) * 100);
    const stabilizationTaskLink = `[${FLAKY_STABILIZATION_TASK_KEY}](https://jira.parcsis.org/browse/${FLAKY_STABILIZATION_TASK_KEY})`;

    if (knownTask) {
        lines.push(`${authorMention}, похоже, в сборке упал уже известный плавающий тест.`);
    } else {
        lines.push(`${authorMention}, похоже, в сборке упал плавающий тест.`);
    }

    lines.push('');
    lines.push(`**Test:** ${test.name}`);
    if (build.webUrl) {
        lines.push(`**Build:** [#${build.number || build.id}](${build.webUrl})`);
    }
    lines.push(`**Уверенность:** ${confidence}%`);
    lines.push(`**Почему:** ${classification.reason || classification.human_summary || 'по истории TeamCity'}`);

    if (knownTask) {
        lines.push('');
        lines.push(`В ${stabilizationTaskLink} уже есть похожая задача: [${knownTask.key}](https://jira.parcsis.org/browse/${knownTask.key})`);
        return lines.join('\n');
    }

    lines.push('');
    lines.push(`В ${stabilizationTaskLink} похожую задачу не нашёл.`);
    lines.push('Завести задачу на стабилизацию? Ответь в этом треде: `да`, `нет`, `уже есть CASEM-12345` или `это не flaky`.');
    return lines.join('\n');
}

async function handleReviewThreadReady(payload) {
    if (!FLAKY_TEST_MONITORING_ENABLED || !payload.gitlabMergeRequestId) {
        return;
    }

    await triageModel.upsertReviewContext({
        review_task_id: payload.reviewTaskId,
        gitlab_merge_request_id: payload.gitlabMergeRequestId,
        post_id: payload.postId,
        channel_id: payload.channelId,
        author_user_id: payload.userId,
        task_key: payload.taskKey,
        merge_request_url: payload.mergeRequestUrl,
    });
}

async function findMatchingReviewContexts(build) {
    const contexts = await triageModel.getActiveReviewContexts();
    const matches = [];

    for (const context of contexts) {
        try {
            if (!await isFlakyTestCheckEnabledForChannel(context.channel_id)) {
                continue;
            }

            const mrInfo = await GitlabService.getMergeRequestInfo(context.project_id, context.mr_iid);
            if (buildMatchesMr(build, mrInfo)) {
                matches.push({ context, mrInfo });
            }
        } catch (error) {
            logger.warn(`[FlakyTriage] Failed to match MR !${context.mr_iid}: ${error.message}`);
        }
    }

    return matches;
}

async function getReviewContextForMergeRequest(mergeRequestUrl) {
    const parsed = parseGitlabMrUrl(mergeRequestUrl);
    if (!parsed) {
        throw new Error('Не удалось распознать GitLab MR URL');
    }

    const project = await GitlabService.getProjectByName(parsed.project);
    if (!project) {
        throw new Error(`Не удалось найти GitLab project ${parsed.project}`);
    }

    const contexts = await triageModel.getActiveReviewContexts();
    const context = contexts.find((item) => (
        Number(item.project_id) === Number(project.project_id)
        && Number(item.mr_iid) === Number(parsed.mrIid)
    ));

    if (!context) {
        const dbMr = await gitlabModel.getMergeRequestById(project.project_id, parsed.mrIid);
        if (!dbMr) {
            throw new Error('Для этого MR не найдено сохранённой GitLab-связи. Сначала переведи задачу в ревью.');
        }

        const reviewTask = await getReviewTaskByGitlabMergeRequestId(dbMr.id);
        if (!reviewTask) {
            throw new Error('Для этого MR не найден review-тред. Сначала переведи задачу в ревью.');
        }

        await triageModel.upsertReviewContext({
            review_task_id: reviewTask.id,
            gitlab_merge_request_id: dbMr.id,
            post_id: reviewTask.post_id,
            channel_id: reviewTask.channel_id,
            author_user_id: reviewTask.user_id,
            task_key: reviewTask.task_key,
            merge_request_url: reviewTask.merge_request_url || mergeRequestUrl,
        });

        const mrInfo = await GitlabService.getMergeRequestInfo(project.project_id, parsed.mrIid);
        return {
            context: {
                review_task_id: reviewTask.id,
                gitlab_merge_request_id: dbMr.id,
                post_id: reviewTask.post_id,
                channel_id: reviewTask.channel_id,
                author_user_id: reviewTask.user_id,
                task_key: reviewTask.task_key,
                merge_request_url: reviewTask.merge_request_url || mergeRequestUrl,
                project_id: project.project_id,
                mr_iid: parsed.mrIid,
            },
            mrInfo,
        };
    }

    const mrInfo = await GitlabService.getMergeRequestInfo(context.project_id, context.mr_iid);
    return { context, mrInfo };
}

async function getManualContextForMergeRequest({ mergeRequestUrl, threadPostId, authorUserId, channelId }) {
    const parsed = parseGitlabMrUrl(mergeRequestUrl);
    if (!parsed) {
        throw new Error('Не удалось распознать GitLab MR URL');
    }

    const project = await GitlabService.getProjectByName(parsed.project);
    if (!project) {
        throw new Error(`Не удалось найти GitLab project ${parsed.project}`);
    }

    const mrInfo = await GitlabService.getMergeRequestInfo(project.project_id, parsed.mrIid);
    const context = {
        review_task_id: getManualReviewTaskId(project.project_id, parsed.mrIid),
        gitlab_merge_request_id: null,
        post_id: threadPostId,
        channel_id: channelId || null,
        author_user_id: authorUserId || null,
        task_key: `manual-flaky-check:${project.project_id}:${parsed.mrIid}`,
        merge_request_url: mergeRequestUrl,
        project_id: project.project_id,
        mr_iid: parsed.mrIid,
    };

    await triageModel.upsertReviewContext(context);

    return {
        context,
        mrInfo,
    };
}

async function runManualCheckForMergeRequest({ mergeRequestUrl, replyPostId, threadPostId, authorUserId, channelId }) {
    if (channelId && !await isFlakyTestCheckEnabledForChannel(channelId)) {
        await mattermost.postMessageInTreed(
            replyPostId,
            'Проверка flaky-тестов выключена для этого review-канала. Включи её в `/admin/review-channels`.'
        );
        return { checkedBuilds: 0, failedTests: 0, disabled: true };
    }

    const { context, mrInfo } = threadPostId
        ? await getManualContextForMergeRequest({ mergeRequestUrl, threadPostId, authorUserId, channelId })
        : await getReviewContextForMergeRequest(mergeRequestUrl);

    if (!await isFlakyTestCheckEnabledForChannel(context.channel_id)) {
        await mattermost.postMessageInTreed(
            replyPostId,
            'Проверка flaky-тестов выключена для этого review-канала. Включи её в `/admin/review-channels`.'
        );
        return { checkedBuilds: 0, failedTests: 0, disabled: true };
    }

    const linkedBuilds = await getTeamCityBuildsFromGitLabStatuses(context, mrInfo);
    if (linkedBuilds.length) {
        return await processManualBuilds({ mergeRequestUrl, replyPostId, context, mrInfo, builds: linkedBuilds });
    }

    const notifications = await require('../../db/models/teamcityBuildNotifications').getAllNotifications();
    const enabledNotifications = (notifications || []).filter((notification) => (
        notification.is_enabled === 1 || notification.is_enabled === true
    ));

    if (!enabledNotifications.length) {
        await mattermost.postMessageInTreed(replyPostId, 'Не нашёл TeamCity build-ов в GitLab external statuses и не нашёл активных TeamCity-настроек для fallback-проверки.');
        return { checkedBuilds: 0, failedTests: 0 };
    }

    let checkedBuilds = 0;
    let failedTests = 0;
    let flakyCandidates = 0;
    let promptsCreated = 0;
    let existingPrompts = 0;
    const existingPromptRefs = [];

    for (const notification of enabledNotifications) {
        const build = await TeamCityService.getLatestBuild(notification.build_config_id);
        if (!build || !TeamCityService.isFinished(build.state)) {
            continue;
        }

        if (!buildMatchesMr(build, mrInfo)) {
            continue;
        }

        checkedBuilds += 1;
        const tests = await TeamCityService.getFailedTests(build.id);
        failedTests += tests.length;

        if (TeamCityService.isFailureStatus(build.status) && tests.length) {
            for (const test of tests) {
                const result = await processFailedTest(build, test, [{ context, mrInfo }]);
                if (result.flaky) {
                    flakyCandidates += 1;
                    promptsCreated += result.promptsCreated;
                    existingPrompts += result.existingPrompts;
                    existingPromptRefs.push(...result.existingPromptRefs);
                }
            }
        }
    }

    const lines = [
        `Проверка flaky-тестов завершена для MR: ${mergeRequestUrl}`,
        `Проверено TeamCity build-ов: ${checkedBuilds}`,
        `Найдено упавших тестов: ${failedTests}`,
    ];

    if (checkedBuilds === 0) {
        lines.push('Не нашёл завершённый TeamCity build, который совпадает с веткой или commit SHA этого MR.');
    } else if (failedTests === 0) {
        lines.push('Упавших тестов в подходящих build-ах не нашёл.');
    } else if (flakyCandidates === 0) {
        lines.push(`Flaky-кандидатов по текущему порогу ${FLAKY_MIN_CONFIDENCE} не найдено.`);
    } else {
        lines.push(`Flaky-кандидатов: ${flakyCandidates}`);
        lines.push(`Новых вопросов в треде: ${promptsCreated}`);
        if (existingPrompts > 0) {
            lines.push(`Уже существующих вопросов: ${existingPrompts}`);
            appendExistingPromptLines(lines, existingPromptRefs);
        }
    }

    if (promptsCreated === 0) {
        await mattermost.postMessageInTreed(replyPostId, lines.join('\n'));
    }
    return { checkedBuilds, failedTests };
}

async function getTeamCityBuildsFromGitLabStatuses(context, mrInfo) {
    if (!mrInfo?.sourceSha) {
        return [];
    }

    const statuses = await GitlabService.getCommitStatuses(context.project_id, mrInfo.sourceSha);
    const buildIds = [];
    const seen = new Set();

    for (const status of statuses) {
        if (!TeamCityService.isTeamCityBuildUrl(status.targetUrl)) {
            continue;
        }

        const buildId = TeamCityService.extractBuildIdFromUrl(status.targetUrl);
        if (!buildId || seen.has(buildId)) {
            continue;
        }

        seen.add(buildId);
        buildIds.push(buildId);
    }

    const builds = [];
    for (const buildId of buildIds) {
        try {
            builds.push(await TeamCityService.getBuildDetails(buildId));
        } catch (error) {
            logger.warn(`[FlakyTriage] Не удалось получить TeamCity build ${buildId} из GitLab status: ${error.message}`);
        }
    }

    return builds.filter(Boolean);
}

async function processManualBuilds({ mergeRequestUrl, replyPostId, context, mrInfo, builds }) {
    let checkedBuilds = 0;
    let failedTests = 0;
    let flakyCandidates = 0;
    let promptsCreated = 0;
    let existingPrompts = 0;
    const existingPromptRefs = [];

    for (const build of builds) {
        if (!TeamCityService.isFinished(build.state)) {
            continue;
        }

        checkedBuilds += 1;
        const tests = TeamCityService.isFailureStatus(build.status)
            ? await TeamCityService.getFailedTests(build.id)
            : [];
        failedTests += tests.length;

        for (const test of tests) {
            const result = await processFailedTest(build, test, [{ context, mrInfo }]);
            if (result.flaky) {
                flakyCandidates += 1;
                promptsCreated += result.promptsCreated;
                existingPrompts += result.existingPrompts;
                existingPromptRefs.push(...result.existingPromptRefs);
            }
        }
    }

    const lines = [
        `Проверка flaky-тестов завершена для MR: ${mergeRequestUrl}`,
        `Источник build-ов: GitLab external statuses`,
        `Проверено TeamCity build-ов: ${checkedBuilds}`,
        `Найдено упавших тестов: ${failedTests}`,
    ];

    if (checkedBuilds === 0) {
        lines.push('В GitLab external statuses нашёл TeamCity-ссылки, но среди них нет завершённых build-ов.');
    } else if (failedTests === 0) {
        lines.push('Упавших тестов в привязанных build-ах не нашёл.');
    } else if (flakyCandidates === 0) {
        lines.push(`Flaky-кандидатов по текущему порогу ${FLAKY_MIN_CONFIDENCE} не найдено.`);
    } else {
        lines.push(`Flaky-кандидатов: ${flakyCandidates}`);
        lines.push(`Новых вопросов в треде: ${promptsCreated}`);
        if (existingPrompts > 0) {
            lines.push(`Уже существующих вопросов: ${existingPrompts}`);
            appendExistingPromptLines(lines, existingPromptRefs);
        }
    }

    if (promptsCreated === 0) {
        await mattermost.postMessageInTreed(replyPostId, lines.join('\n'));
    }
    return { checkedBuilds, failedTests };
}

async function processFailedTest(build, test, matches) {
    const testIdentity = normalizeTestIdentity(test.name);
    const buildConfigId = build.buildType?.id || test.build?.buildTypeId;
    const localEvents = await triageModel.getRecentTestEvents(testIdentity, 20);
    const history = await TeamCityService.getTestHistory({
        testId: test.testId,
        testName: test.name,
        buildConfigId,
        limit: 20,
    });

    await triageModel.addTestEvent({
        build_id: String(build.id),
        build_config_id: buildConfigId,
        build_number: build.number,
        build_url: build.webUrl,
        test_name: test.name,
        test_identity: testIdentity,
        status: test.status || 'FAILURE',
        details: test.details,
        stacktrace: test.stacktrace,
    });

    const classification = await classifier.classify({ test, history, localEvents });
    if (!classification.is_flaky || Number(classification.confidence || 0) < FLAKY_MIN_CONFIDENCE) {
        return { flaky: false, promptsCreated: 0, existingPrompts: 0, existingPromptRefs: [] };
    }

    const knownTask = await jiraMatcher.findKnownStabilizationTask(test.name);
    let promptsCreated = 0;
    let existingPrompts = 0;
    const existingPromptRefs = [];

    for (const { context, mrInfo } of matches) {
        const existingPrompt = await triageModel.getPromptByReviewBuildTest(context.review_task_id, String(build.id), testIdentity);
        if (existingPrompt) {
            existingPrompts += 1;
            const ref = await getMattermostPostReference(existingPrompt.prompt_post_id);
            if (ref) {
                existingPromptRefs.push(ref);
            }
            continue;
        }

        const authorMention = await resolveAuthorMention(context, mrInfo);
        const message = formatPrompt({ authorMention, test, build, classification, knownTask });
        const post = await mattermost.postMessageInTreed(context.post_id, message);
        if (!post?.id) {
            logger.warn(`[FlakyTriage] Не удалось отправить prompt для теста ${test.name} в тред ${context.post_id}`);
            continue;
        }

        await triageModel.createPrompt({
            review_task_id: context.review_task_id,
            test_identity: testIdentity,
            test_name: test.name,
            build_id: String(build.id),
            build_url: build.webUrl,
            jira_task_key: knownTask?.key || null,
            prompt_post_id: post.id,
            status: knownTask ? 'known' : 'waiting',
            confidence: classification.confidence,
            classifier_summary: classification.human_summary || classification.reason,
        });
        promptsCreated += 1;
    }

    return { flaky: true, promptsCreated, existingPrompts, existingPromptRefs };
}

async function handleTeamCityBuildFinished({ build }) {
    if (!FLAKY_TEST_MONITORING_ENABLED || !TeamCityService.isFailureStatus(build?.status)) {
        return;
    }

    const failedTests = await TeamCityService.getFailedTests(build.id);
    if (!failedTests.length) {
        return;
    }

    const matches = await findMatchingReviewContexts(build);
    if (!matches.length) {
        return;
    }

    for (const test of failedTests) {
        await processFailedTest(build, test, matches);
    }
}

async function handleTriageResponse(post) {
    if (!post.root_id || post.props?.from_bot) {
        return;
    }

    const prompt = await triageModel.getLatestWaitingPromptByReviewPostId(post.root_id);
    if (!prompt) {
        return;
    }

    const message = String(post.message || '').trim();
    const knownMatch = message.match(/\b(CASEM-\d+)\b/i);
    if (/^(да|yes|y|\+|ок|ok)$/i.test(message)) {
        const summary = `[Back] Плавающий тест - ${getShortTestName(prompt.test_name)}`;
        const description = await buildJiraDescription(prompt);

        const created = await JiraService.createTask({
            fields: {
                project: { key: FLAKY_JIRA_PROJECT_KEY },
                issuetype: { id: FLAKY_JIRA_ISSUE_TYPE_ID },
                summary,
                description,
                labels: ['Back-end', 'DevStaff'],
                [FLAKY_JIRA_EPIC_LINK_FIELD]: FLAKY_STABILIZATION_TASK_KEY,
            },
        });

        await triageModel.updatePrompt(prompt.id, {
            status: 'created',
            jira_task_key: created?.key || null,
        });
        await mattermost.postMessageInTreed(post.id, created?.key
            ? `Создал задачу на стабилизацию: [${created.key}](https://jira.parcsis.org/browse/${created.key})`
            : 'Попробовал создать задачу, но Jira не вернула ключ. Проверь, пожалуйста, Jira.');
        return;
    }

    if (knownMatch) {
        const key = knownMatch[1].toUpperCase();
        await triageModel.updatePrompt(prompt.id, {
            status: 'linked',
            jira_task_key: key,
        });
        await mattermost.postMessageInTreed(post.id, `Связал падение с задачей [${key}](https://jira.parcsis.org/browse/${key}).`);
        return;
    }

    if (/^(нет|no|n|-|не надо|это не flaky|не flaky)$/i.test(message)) {
        await triageModel.updatePrompt(prompt.id, {
            status: /flaky/i.test(message) ? 'not_flaky' : 'declined',
        });
        await mattermost.postMessageInTreed(post.id, 'Ок, задачу на стабилизацию не завожу.');
    }
}

module.exports = {
    handleReviewThreadReady,
    handleTeamCityBuildFinished,
    handleTriageResponse,
    runManualCheckForMergeRequest,
    _private: {
        buildMatchesMr,
        formatPrompt,
        getReviewContextForMergeRequest,
        getManualContextForMergeRequest,
        getTeamCityBuildsFromGitLabStatuses,
        appendExistingPromptLines,
        getShortTestName,
        buildJiraDescription,
    },
};
