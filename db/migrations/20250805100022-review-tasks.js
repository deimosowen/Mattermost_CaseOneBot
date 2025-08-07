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
  return db.createTable('review_task',
    {
      id: { type: 'int', primaryKey: true, autoIncrement: true },
      channel_id: 'text',
      post_id: 'text',
      user_id: 'text',
      task_key: 'text',
      merge_request_url: 'text',
      reviewer: 'text',
      status: { type: 'text', defaultValue: 'In Review' },
      created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') },
      updated_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP'), onUpdate: 'CURRENT_TIMESTAMP' }
    }).then(function () {
      return db.createTable('review_task_notification',
        {
          id: { type: 'int', primaryKey: true, autoIncrement: true },
          review_task_id: {
            type: 'int', notNull: true, foreignKey: {
              name: 'fk_review_task_notification_review_task',
              table: 'review_task',
              mapping: 'id',
              rules: {
                onDelete: 'CASCADE',
                onUpdate: 'RESTRICT'
              }
            }
          },
          created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') },
        });
    });
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};
