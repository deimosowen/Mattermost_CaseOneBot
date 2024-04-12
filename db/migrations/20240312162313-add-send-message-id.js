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
  return db.addColumn('forward_processed_messages', 'send_message_id', {
    type: 'string',
    defaultValue: '0'
  });
};

exports.down = function (db) {
  return db.removeColumn('forward_processed_messages', 'send_message_id');
};

exports._meta = {
  "version": 1
};
