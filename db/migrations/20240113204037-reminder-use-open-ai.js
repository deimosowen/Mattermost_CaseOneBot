'use strict';

var dbm;
var type;
var seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function (db) {
  return db.addColumn('reminders', 'use_open_ai', {
    type: 'boolean',
    defaultValue: false
  }).then(function () {
    return db.addColumn('reminders', 'prompt', {
      type: 'text'
    });
  }).then(function () {
    return db.addColumn('reminders', 'template', {
      type: 'text'
    });
  });
};

exports.down = function (db) {
  return db.removeColumn('reminders', 'use_open_ai')
    .then(function () {
      return db.removeColumn('reminders', 'prompt');
    })
    .then(function () {
      return db.removeColumn('reminders', 'template');
    });
};

exports._meta = {
  "version": 1
};
