const invite = require('./invite');
const calendarSettings = require('./calendar/calendarSettings');
const calendarRemove = require('./calendarRemove');
const meet = require('./meet');
const reminder = require('./reminder');
const reminderList = require('./reminderList');
const reminderRemove = require('./reminderRemove');
const reminderHelp = require('./reminderHelp');
const duty = require('./duty/duty');
const dutyRemove = require('./duty/dutyRemove');
const dutyCurrent = require('./duty/dutyCurrent');
const dutyNext = require('./duty/dutyNext');
const dutyHelp = require('./duty/dutyHelp');
const dutyStatistics = require('./duty/dutyStatistics');
const forward = require('./forward/forward');
const forwardList = require('./forward/forwardList');
const forwardRemove = require('./forward/forwardRemove');
const forwardHelp = require('./forward/forwardHelp');
const ping = require('./ping');
const sendAs = require('./sendAs');
const jira = require('./jira');
const reop = require('./reop');
const review = require('./review');
const removeMessage = require('./removeMessage');

const commands = {
    '!r': removeMessage,
    '!ping': ping,
    '!jira': jira,
    '!sendAs': sendAs,
    '!invite': invite,
    '!calendar': calendarSettings,
    '!calendar-settings': calendarSettings,
    '!calendar-remove': calendarRemove,
    '!meet': meet,
    '!reminder': reminder,
    '!reminder-list': reminderList,
    '!reminder-remove': reminderRemove,
    '!reminder-help': reminderHelp,
    '!duty': duty,
    '!duty-remove': dutyRemove,
    '!duty-current': dutyCurrent,
    '!duty-next': dutyNext,
    '!duty-help': dutyHelp,
    '!stat': dutyStatistics,
    '!forward': forward,
    '!forward-list': forwardList,
    '!forward-remove': forwardRemove,
    '!forward-help': forwardHelp,
    '!reop': reop,
    '!review': review
};

module.exports = commands;