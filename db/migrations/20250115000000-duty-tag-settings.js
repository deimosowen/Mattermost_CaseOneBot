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
  return db.createTable('duty_tag_settings', {
    id: { type: 'int', primaryKey: true, autoIncrement: true },
    channel_id: { type: 'text', notNull: true },
    is_enabled: { type: 'boolean', defaultValue: false },
    tag: { type: 'text', notNull: true },
    channel_prefix: { type: 'text' },
    created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
  }).then(function () {
    // Создаем уникальный индекс для комбинации channel_id и tag
    return db.addIndex('duty_tag_settings', 'duty_tag_settings_channel_tag_idx', ['channel_id', 'tag'], true);
  });
};

exports.down = function (db) {
  return db.dropTable('duty_tag_settings');
};

exports._meta = {
  "version": 1
};

