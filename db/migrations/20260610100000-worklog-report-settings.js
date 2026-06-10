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
    CREATE TABLE IF NOT EXISTS worklog_report_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_channel_id TEXT NOT NULL,
      target_channel_id TEXT NOT NULL,
      cron_schedule TEXT NOT NULL,
      period_preset TEXT NOT NULL DEFAULT 'previous_week',
      run_on_workdays_only INTEGER NOT NULL DEFAULT 1,
      show_mode TEXT NOT NULL DEFAULT 'problems',
      message_template TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO admin_group_menu_permissions (group_id, menu_key)
    SELECT id, 'worklog_reports'
    FROM admin_groups
    WHERE name = 'Администраторы';
  `);
};

exports.down = function (db) {
  return db.runSql(`
    DELETE FROM admin_group_menu_permissions
    WHERE menu_key = 'worklog_reports';

    DROP TABLE IF EXISTS worklog_report_settings;
  `);
};

exports._meta = {
  "version": 1
};
