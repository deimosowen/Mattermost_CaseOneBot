const calendar = require('./calendar');
const calendarRemove = require('./calendarRemove');
const reminder = require('./reminder');
const reminderList = require('./reminderList');
const reminderRemove = require('./reminderRemove');
const reminderHelp = require('./reminderHelp');

const commands = {
    '!calendar': calendar,
    '!calendar-remove': calendarRemove,
    '!reminder': reminder,
    '!reminder-list': reminderList,
    '!reminder-remove': reminderRemove,
    '!reminder-help': reminderHelp,
};

module.exports = commands;