const calendar = require('./calendar');
const reminder = require('./reminder');
const reminderList = require('./reminderList');
const reminderRemove = require('./reminderRemove');
const reminderHelp = require('./reminderHelp');

const commands = {
    //'!calendar': calendar, 
    '!reminder': reminder,
    '!reminder-list': reminderList,
    '!reminder-remove': reminderRemove,
    '!reminder-help': reminderHelp,
};

module.exports = commands;