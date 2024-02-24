'use strict';

var dbm;
var type;
var seed;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function (db) {
  return db.dropTable('notified_events')
    .then(function () {
      db.createTable('notified_events', {
        id: { type: 'int', primaryKey: true, autoIncrement: true },
        user_id: 'text',
        event_id: 'text',
        summary: 'string',
        start_date: 'string',
        end_date: 'string',
        date_time_zone: 'string',
        is_logged: { type: 'boolean', defaultValue: false }
      })
    });
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};
