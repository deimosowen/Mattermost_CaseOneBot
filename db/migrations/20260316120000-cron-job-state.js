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
    return db.createTable('cron_job_state', {
        job_key: { type: 'string', primaryKey: true, length: 255 },
        last_success_at: { type: 'datetime' },
        updated_at: { type: 'datetime', defaultValue: new String('CURRENT_TIMESTAMP') }
    });
};

exports.down = function (db) {
    return db.dropTable('cron_job_state');
};

exports._meta = {
    version: 1
};
