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
  return db.createTable('invite_channels', {
    id: { type: 'int', primaryKey: true, autoIncrement: true },
    main_channel_id: { type: 'text', notNull: true },
    prefix: { type: 'text', notNull: true },
    created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
  }).then(function () {
    // Создаем уникальный индекс для комбинации main_channel_id и prefix
    return db.addIndex('invite_channels', 'invite_channels_main_channel_prefix_idx', ['main_channel_id', 'prefix'], true);
  });
};

exports.down = function (db) {
  return db.dropTable('invite_channels');
};

