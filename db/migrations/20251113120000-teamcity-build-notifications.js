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
  return db.createTable('teamcity_build_notifications',
    {
      id: { type: 'int', primaryKey: true, autoIncrement: true },
      build_config_id: { type: 'text', notNull: true },
      build_config_name: { type: 'text', notNull: true },
      channel_id: { type: 'text', notNull: true },
      channel_name: { type: 'text' },
      post_id: { type: 'text' },
      notify_on: { type: 'text', notNull: true, defaultValue: 'all' }, // all, success, failure
      is_enabled: { type: 'boolean', defaultValue: true },
      last_build_id: { type: 'text' },
      last_checked_at: { type: 'timestamp' },
      created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') },
      updated_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
    });
};

exports.down = function (db) {
  return db.dropTable('teamcity_build_notifications');
};

exports._meta = {
  "version": 1
};

