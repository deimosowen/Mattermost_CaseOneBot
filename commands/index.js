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
};

module.exports = commands;