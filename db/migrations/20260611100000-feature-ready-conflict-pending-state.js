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

exports.up = function (db) {
  return addColumnIfMissing(
    db,
    'feature_merge_requests',
    'conflict_pending_has_conflicts',
    'conflict_pending_has_conflicts INTEGER DEFAULT NULL'
  ).then(function () {
    return addColumnIfMissing(
      db,
      'feature_merge_requests',
      'conflict_pending_count',
      'conflict_pending_count INTEGER DEFAULT 0'
    );
  }).then(function () {
    return addColumnIfMissing(
      db,
      'feature_merge_requests',
      'conflict_source_sha',
      'conflict_source_sha TEXT DEFAULT NULL'
    );
  });
};

exports.down = function () {
  return null;
};

exports._meta = {
  "version": 1
};
