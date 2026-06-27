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
        ALTER TABLE review_channels
        ADD COLUMN flaky_tests_enabled INTEGER NOT NULL DEFAULT 0
    `);
};

exports.down = function (db) {
    return db.runSql(`
        CREATE TABLE review_channels_tmp (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `).then(function () {
        return db.runSql(`
            INSERT INTO review_channels_tmp (id, channel_id, created_at, updated_at)
            SELECT id, channel_id, created_at, updated_at
            FROM review_channels;
        `);
    }).then(function () {
        return db.dropTable('review_channels');
    }).then(function () {
        return db.runSql('ALTER TABLE review_channels_tmp RENAME TO review_channels;');
    }).then(function () {
        return db.addIndex('review_channels', 'review_channels_channel_id_idx', ['channel_id'], true);
    });
};

exports._meta = {
    "version": 1
};
