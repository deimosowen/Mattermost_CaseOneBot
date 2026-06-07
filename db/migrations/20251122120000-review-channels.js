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
    return db.createTable('review_channels', {
        id: { type: 'int', primaryKey: true, autoIncrement: true },
        channel_id: { type: 'text', notNull: true, unique: true },
        created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') },
        updated_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
    }).then(function () {
        // Создаем уникальный индекс для channel_id
        return db.addIndex('review_channels', 'review_channels_channel_id_idx', ['channel_id'], true);
    });
};

exports.down = function (db) {
    return db.dropTable('review_channels');
};

