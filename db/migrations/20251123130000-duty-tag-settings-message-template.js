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
    return db.addColumn('duty_tag_settings', 'message_template', {
        type: 'text',
        defaultValue: '{duty_mention}'
    });
};

exports.down = function (db) {
    return db.removeColumn('duty_tag_settings', 'message_template');
};

exports._meta = {
    "version": 1
};

