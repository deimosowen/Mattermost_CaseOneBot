const invite = require('./invite');
const calendar = require('./calendar');
const calendarRemove = require('./calendarRemove');
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

const commands = {
    '!invite': invite,
    '!calendar': calendar,
    '!calendar-remove': calendarRemove,
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
    '!forward-help': forwardHelp
};

module.exports = commands;