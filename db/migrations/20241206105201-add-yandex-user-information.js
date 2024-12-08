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
  return db.runSql('DELETE FROM calendars')
    .then(() => {
      return db.createTable('user_info', {
        id: { type: 'int', primaryKey: true, autoIncrement: true },
        user_id: 'text',
        yandex_id: 'text',
        login: 'text',
        client_id: 'text',
        display_name: 'string',
        real_name: 'string',
        first_name: 'string',
        last_name: 'string',
        sex: 'string',
        default_email: 'text',
        emails: { type: 'json' },
        birthday: 'string',
        default_avatar_id: 'text',
        is_avatar_empty: { type: 'boolean' },
        psuid: 'text'
      });
    });
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};
