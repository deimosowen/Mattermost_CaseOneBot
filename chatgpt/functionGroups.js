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
        'describeDutyCommands',
        'describeCalendarCommands',
        'describeJiraCommands',
        'describeInviteCommands',
        'describeReminderCommands',
        'describeForwardingCommands',
    ],
    forwarding: ['describeForwardingCommands'],
};

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
    REQUIRES_POST,
    FALLBACK_GROUPS,
};
