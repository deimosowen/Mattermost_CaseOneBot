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
  return db.addColumn('reminders', 'is_generate_image', {
    type: 'boolean',
    defaultValue: false
  }).then(function () {
    return db.addColumn('reminders', 'generate_image_prompt', {
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
