jest.mock('../../../config', () => ({
    API_BASE_URL: 'mmdev.pravo.tech',
    FLAKY_TEST_MONITORING_ENABLED: true,
    FLAKY_STABILIZATION_TASK_KEY: 'CASEM-93785',
    FLAKY_MIN_CONFIDENCE: 0.55,
    FLAKY_JIRA_PROJECT_KEY: 'CASEM',
    FLAKY_JIRA_ISSUE_TYPE_ID: '3',
    FLAKY_JIRA_EPIC_LINK_FIELD: 'customfield_11161',
}));
jest.mock('../../../services/teamcityService', () => ({
    getBuildDetails: jest.fn(),
}));
jest.mock('../../../services/gitlabService', () => ({
    getProjectByName: jest.fn(),
    getMergeRequestInfo: jest.fn(),
    getCommitStatuses: jest.fn(),
}));
jest.mock('../../../services/jiraService', () => ({}));
jest.mock('../../../mattermost/utils', () => ({
    getPostPermalink: jest.fn(),
    postMessageInTreed: jest.fn(),
}));
jest.mock('../../../db/models/gitlab', () => ({}));
jest.mock('../../../db/models/reviewTask', () => ({}));
jest.mock('../../../db/models/flakyTestTriage', () => ({
    upsertReviewContext: jest.fn(),
}));
jest.mock('../../../db/models/reviewChannels', () => ({
    isFlakyTestCheckEnabledForChannel: jest.fn(),
}));
jest.mock('../../../services/flakyTest/flakyTestClassifier', () => ({
    classify: jest.fn(),
}));
jest.mock('../../../services/flakyTest/flakyJiraMatcher', () => ({
    findKnownStabilizationTask: jest.fn(),
}));
jest.mock('../../../logger', () => ({
    error: jest.fn(),
    warn: jest.fn(),
}));

const mattermost = require('../../../mattermost/utils');
const GitlabService = require('../../../services/gitlabService');
const TeamCityService = require('../../../services/teamcityService');
const { isFlakyTestCheckEnabledForChannel } = require('../../../db/models/reviewChannels');
const { _private } = require('../../../services/flakyTest/flakyTriageService');
const { runManualCheckForMergeRequest } = require('../../../services/flakyTest/flakyTriageService');

describe('flakyTriageService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('adds links to already existing prompt posts', () => {
        const lines = ['Уже существующих вопросов: 2'];

        _private.appendExistingPromptLines(lines, [
            { postId: 'post-1', url: 'https://mmdev.pravo.tech/alpha/pl/post-1' },
            { postId: 'post-1', url: 'https://mmdev.pravo.tech/alpha/pl/post-1' },
            { postId: 'post-2', url: null },
        ]);

        expect(lines).toEqual([
            'Уже существующих вопросов: 2',
            'Существующие вопросы:',
            '- [вопрос 1](https://mmdev.pravo.tech/alpha/pl/post-1)',
            '- вопрос 2: post-2',
        ]);
    });

    test('formats stabilization task key as a link in prompts', () => {
        const message = _private.formatPrompt({
            authorMention: '@author',
            test: { name: 'CaseMap.Tests.SomeTest' },
            build: { id: '123', number: '42', webUrl: 'https://teamcity/build/123' },
            classification: {
                confidence: 0.7,
                reason: 'в истории есть и падения, и успешные прогоны',
            },
            knownTask: null,
        });

        expect(message).toContain('[CASEM-93785](https://jira.parcsis.org/browse/CASEM-93785) похожую задачу не нашёл');
    });

    test('uses only test method name for Jira summary suffix', () => {
        expect(_private.getShortTestName(
            'CaseMap.Tests: CaseMap.Tests.MainModules.ProjectModules.Projects.ImportObjects.CreateImportedUserTests.ImportUsers_MaxUsersRestriction'
        )).toBe('ImportUsers_MaxUsersRestriction');
    });

    test('keeps full test name and adds Mattermost link in Jira description', async () => {
        mattermost.getPostPermalink.mockResolvedValue('https://mmdev.pravo.tech/alpha/pl/prompt-post-id');

        const description = await _private.buildJiraDescription({
            test_name: 'CaseMap.Tests: CaseMap.Tests.MainModules.ProjectModules.Projects.ImportObjects.CreateImportedUserTests.ImportUsers_MaxUsersRestriction',
            build_url: 'https://teamcity/build/123',
            classifier_summary: 'в истории есть и падения, и успешные прогоны',
            prompt_post_id: 'prompt-post-id',
            post_id: 'thread-post-id',
        });

        expect(description).toContain('Плавающий тест: CaseMap.Tests: CaseMap.Tests.MainModules.ProjectModules.Projects.ImportObjects.CreateImportedUserTests.ImportUsers_MaxUsersRestriction');
        expect(description).toContain('Обсуждение: [Mattermost thread](https://mmdev.pravo.tech/alpha/pl/prompt-post-id)');
    });

    test('does not run manual check when flaky checks are disabled for channel', async () => {
        GitlabService.getProjectByName.mockResolvedValue({ project_id: 123 });
        GitlabService.getMergeRequestInfo.mockResolvedValue({ sourceSha: 'abc123' });
        isFlakyTestCheckEnabledForChannel.mockResolvedValue(false);

        const result = await runManualCheckForMergeRequest({
            mergeRequestUrl: 'https://gitlab.example/group/project/-/merge_requests/12',
            replyPostId: 'command-post-id',
            threadPostId: 'thread-post-id',
            authorUserId: 'user-id',
            channelId: 'channel-id',
        });

        expect(result).toEqual({ checkedBuilds: 0, failedTests: 0, disabled: true });
        expect(mattermost.postMessageInTreed).toHaveBeenCalledWith(
            'command-post-id',
            expect.stringContaining('Проверка flaky-тестов выключена')
        );
        expect(GitlabService.getProjectByName).not.toHaveBeenCalled();
        expect(GitlabService.getMergeRequestInfo).not.toHaveBeenCalled();
        expect(GitlabService.getCommitStatuses).not.toHaveBeenCalled();
        expect(TeamCityService.getBuildDetails).not.toHaveBeenCalled();
    });
});
