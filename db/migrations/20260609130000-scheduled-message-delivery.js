'use strict';

var dbm;
var type;
var seed;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

function addColumnIfMissing(db, tableName, columnName, columnSql) {
  const getColumns = typeof db.all === 'function'
    ? db.all.bind(db)
    : db.runSql.bind(db);

  return getColumns(`PRAGMA table_info(${tableName});`).then(function (columns) {
    const rows = Array.isArray(columns) ? columns : [];
    const exists = rows.some(function (column) {
      return column.name === columnName;
    });

    if (exists) {
      return null;
    }

    return db.runSql(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql};`).catch(function (error) {
      if (/duplicate column name/i.test(error && error.message)) {
        return null;
      }
      throw error;
    });
  });
}

function ensureScheduledMessagesColumns(db) {
  const columns = [
    ['rule_type', 'rule_type TEXT'],
    ['source_type', 'source_type TEXT'],
    ['source_id', 'source_id TEXT'],
    ['idempotency_key', 'idempotency_key TEXT'],
    ['last_error', 'last_error TEXT'],
    ['created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ['updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ['sent_at', 'sent_at DATETIME']
  ];

  return columns.reduce(function (promise, column) {
    return promise.then(function () {
      return addColumnIfMissing(db, 'scheduled_messages', column[0], column[1]);
    });
  }, Promise.resolve());
}

exports.up = function (db) {
  return db.runSql(`
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transport TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      message TEXT NOT NULL,
      rule_type TEXT,
      send_after DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      source_type TEXT,
      source_id TEXT,
      idempotency_key TEXT,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME
    );
  `).then(function () {
    return ensureScheduledMessagesColumns(db);
  }).then(function () {
    return db.runSql('CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due ON scheduled_messages (status, send_after);');
  }).then(function () {
    return db.runSql('CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_messages_idempotency ON scheduled_messages (idempotency_key) WHERE idempotency_key IS NOT NULL;');
  }).then(function () {
    return addColumnIfMissing(
      db,
      'forward_channel_mapping',
      'thread_message_delivery_mode',
      "thread_message_delivery_mode TEXT DEFAULT 'immediate'"
    );
  });
};

exports.down = function (db) {
  return db.removeColumn('forward_channel_mapping', 'thread_message_delivery_mode')
    .then(function () {
      return db.dropTable('scheduled_messages');
    });
};

exports._meta = {
  "version": 1
};
