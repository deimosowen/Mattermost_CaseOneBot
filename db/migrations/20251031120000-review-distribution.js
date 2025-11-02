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
  return db.createTable('channel_review_settings',
    {
      id: { type: 'int', primaryKey: true, autoIncrement: true },
      channel_id: { type: 'text', notNull: true, unique: true },
      review_type: { type: 'text', notNull: true, defaultValue: 'manual' },
      is_enabled: { type: 'boolean', defaultValue: false },
      created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') },
      updated_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
    }).then(function () {
      return db.createTable('review_queue',
        {
          id: { type: 'int', primaryKey: true, autoIncrement: true },
          channel_id: { type: 'text', notNull: true },
          user_id: { type: 'text', notNull: true },
          user_name: { type: 'text', notNull: true },
          order_number: { type: 'int', notNull: true },
          is_disabled: { type: 'boolean', defaultValue: false },
          return_date: { type: 'text' },
          created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
        });
    }).then(function () {
      return db.createTable('review_current',
        {
          id: { type: 'int', primaryKey: true, autoIncrement: true },
          channel_id: { type: 'text', notNull: true, unique: true },
          user_id: { type: 'text', notNull: true },
          updated_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
        });
    });
};

exports.down = function (db) {
  return db.dropTable('review_current')
    .then(function () {
      return db.dropTable('review_queue');
    })
    .then(function () {
      return db.dropTable('channel_review_settings');
    });
};

exports._meta = {
  "version": 1
};
