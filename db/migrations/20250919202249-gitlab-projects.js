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
  return db.createTable('gitlab_projects', {
    id: { type: 'int', primaryKey: true, autoIncrement: true },
    project_id: { type: 'int', notNull: true, unique: true },
    project_name: { type: 'string', notNull: true },
    created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
  }).then(function () {
    return db.createTable('gitlab_merge_requests', {
      id: { type: 'int', primaryKey: true, autoIncrement: true },
      project_id: {
        type: 'int', notNull: true, foreignKey: {
          name: 'fk_gitlab_merge_requests_project',
          table: 'gitlab_projects',
          mapping: 'id'
        }
      },
      mr_iid: { type: 'int', notNull: true },
      status: { type: 'string', notNull: true },
      created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') },
      updated_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP'), onUpdate: 'CURRENT_TIMESTAMP' }
    });
  }).then(function () {
    return db.addColumn('review_task', 'gitlab_merge_request_id', {
      type: 'int',
      foreignKey: {
        name: 'fk_review_task_gitlab_merge_request',
        table: 'gitlab_merge_requests',
        mapping: 'id',
      },
      notNull: false
    });
  });
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};
