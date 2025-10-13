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
  return db.createTable('feature_ready', {
    id: { type: 'int', primaryKey: true, autoIncrement: true },
    task_id: { type: 'string', notNull: true },
    task_name: { type: 'string' },
    description: { type: 'text' },
    merge_tasks: { type: 'string' },
    mattermost_post_id: { type: 'string' },
    created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
  })
    .then(function () {
      return db.createTable('feature_merge_requests', {
        id: { type: 'int', primaryKey: true, autoIncrement: true },
        feature_id: {
          type: 'int', notNull: true, foreignKey: {
            name: 'fk_feature_merge_requests_feature',
            table: 'feature_ready',
            mapping: 'id'
          }
        },
        merge_request_id: {
          type: 'int', notNull: true, foreignKey: {
            name: 'fk_feature_merge_requests_merge_request',
            table: 'gitlab_merge_requests',
            mapping: 'id'
          }
        },
        role: { type: 'string', notNull: true },
        has_conflicts: { type: 'boolean', defaultValue: false },
        created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
      });
    });
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};
