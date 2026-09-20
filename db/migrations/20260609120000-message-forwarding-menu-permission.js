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
  return db.runSql(`
    INSERT OR IGNORE INTO admin_group_menu_permissions (group_id, menu_key)
    SELECT id, 'message_forwarding'
    FROM admin_groups
    WHERE name = 'Администраторы';
  `);
};

exports.down = function (db) {
  return db.runSql(`
    DELETE FROM admin_group_menu_permissions
    WHERE menu_key = 'message_forwarding';
  `);
};

exports._meta = {
  "version": 1
};
