'use strict';

var dbm;
var type;
var seed;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

const adminMenuKeys = [
  'duty_list',
  'calendar_settings',
  'feature_ready',
  'patch_message',
  'teamcity',
  'invite',
  'jira_worklog',
  'review',
  'reminders',
  'commands',
  'admin_panel',
  'admin_users',
  'admin_invite_channels',
  'admin_review_channels',
  'review_settings'
];

const userMenuKeys = [
  'duty_list',
  'calendar_settings',
  'feature_ready',
  'patch_message',
  'teamcity',
  'invite',
  'jira_worklog',
  'review',
  'reminders',
  'commands'
];

function insertPermissionsSql(groupName, menuKeys) {
  return menuKeys.map((menuKey) => (
    `INSERT INTO admin_group_menu_permissions (group_id, menu_key)
     SELECT id, '${menuKey}' FROM admin_groups WHERE name = '${groupName}';`
  )).join('\n');
}

exports.up = function (db) {
  return db.createTable('admin_groups', {
    id: { type: 'int', primaryKey: true, autoIncrement: true },
    name: { type: 'string', notNull: true, unique: true },
    description: 'text',
    is_admin: { type: 'boolean', defaultValue: false },
    created_at: { type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' },
    updated_at: { type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' }
  }).then(function () {
    return db.createTable('admin_users', {
      id: { type: 'int', primaryKey: true, autoIncrement: true },
      mattermost_user_id: { type: 'string', notNull: true, unique: true },
      username: 'string',
      display_name: 'string',
      email: 'string',
      group_id: 'int',
      is_enabled: { type: 'boolean', defaultValue: true },
      created_at: { type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' },
      updated_at: { type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' }
    });
  }).then(function () {
    return db.createTable('admin_group_menu_permissions', {
      id: { type: 'int', primaryKey: true, autoIncrement: true },
      group_id: { type: 'int', notNull: true },
      menu_key: { type: 'string', notNull: true },
      created_at: { type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' }
    });
  }).then(function () {
    return db.runSql('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_menu_permissions_unique ON admin_group_menu_permissions (group_id, menu_key);');
  }).then(function () {
    return db.runSql(`
      INSERT INTO admin_groups (name, description, is_admin)
      VALUES
        ('Администраторы', 'Полный доступ ко всем разделам и административным настройкам', 1),
        ('Пользователи', 'Базовый доступ к пользовательским разделам', 0);
    `);
  }).then(function () {
    return db.runSql(insertPermissionsSql('Администраторы', adminMenuKeys));
  }).then(function () {
    return db.runSql(insertPermissionsSql('Пользователи', userMenuKeys));
  });
};

exports.down = function (db) {
  return db.dropTable('admin_group_menu_permissions')
    .then(function () {
      return db.dropTable('admin_users');
    })
    .then(function () {
      return db.dropTable('admin_groups');
    });
};

exports._meta = {
  "version": 1
};
