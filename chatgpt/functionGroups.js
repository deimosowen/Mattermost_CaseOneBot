/**
 * Группы function calling tools.
 * core — всегда добавляется селектором.
 */
const GROUP_FUNCTIONS = {
    core: ['getCurrentDate', 'setContextData'],
    duty: [
        'getCurrentDuty',
        'rotateDuty',
        'changeNextDuty',
        'updateDutyActivityStatus',
        'describeDutyCommands',
    ],
    calendar: [
        'getCalendarSettings',
        'getUsersAvailability',
        'getAllUsersAvailability',
        'describeCalendarCommands',
    ],
    jira: ['inReview', 'changeReviewReviewer', 'reopenReviewTask', 'describeJiraCommands'],
    invite: ['inviteToChannel', 'describeInviteCommands'],
    media: ['createImages'],
    thread: ['getPostThreadMessages'],
    help: [
        'describeAllCommands',
        'describeDutyCommands',
        'describeCalendarCommands',
        'describeJiraCommands',
        'describeInviteCommands',
        'describeReminderCommands',
        'describeForwardingCommands',
    ],
    forwarding: ['describeForwardingCommands'],
};

/**
 * Безопасные функции, которые доступны модели всегда.
 * Сюда стоит добавлять read-only инструменты вроде searchKnowledge.
 */
const ALWAYS_ENABLED_FUNCTIONS = new Set([
    'getCurrentDate',
    'setContextData',
]);

/** Функции, для которых нужен Mattermost post (channel_id / post_id). */
const REQUIRES_POST = new Set([
    'inviteToChannel',
    'getPostThreadMessages',
    'inReview',
    'changeReviewReviewer',
    'reopenReviewTask',
    'createImages',
]);

const FALLBACK_GROUPS = ['help', 'duty', 'calendar'];

module.exports = {
    GROUP_FUNCTIONS,
    ALWAYS_ENABLED_FUNCTIONS,
    REQUIRES_POST,
    FALLBACK_GROUPS,
};
