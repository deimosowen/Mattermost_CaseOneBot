const invite = require('./invite');
const calendar = require('./calendar');
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
const forward = require('./forward/forward');
const forwardList = require('./forward/forwardList');
const forwardRemove = require('./forward/forwardRemove');
const forwardHelp = require('./forward/forwardHelp');
const ping = require('./ping');
const sendAs = require('./sendAs');

const commands = {
    '!ping': ping,
    '!sendAs': sendAs,
    '!invite': invite,
    '!calendar': calendar,
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
    '!forward': forward,
    '!forward-list': forwardList,
    '!forward-remove': forwardRemove,
    '!forward-help': forwardHelp,
};

module.exports = commands;