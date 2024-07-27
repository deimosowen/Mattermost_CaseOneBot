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
  return db.addColumn('notified_events', 'status_set', {
    type: 'boolean',
    defaultValue: false
  }).then(function () {
    return db.addColumn('user_settings', 'mattermost_token', {
      type: 'text'
    });
  }).then(function () {
    return db.addColumn('user_settings', 'dnd_mode', {
      type: 'boolean',
      defaultValue: false
    });
  }).then(function () {
    return db.addColumn('user_settings', 'event_summary', {
      type: 'text'
    });
  });
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};
