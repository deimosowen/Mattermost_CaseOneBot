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
    CREATE TABLE IF NOT EXISTS flaky_review_contexts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_task_id INTEGER NOT NULL,
      gitlab_merge_request_id INTEGER,
      post_id TEXT NOT NULL,
      channel_id TEXT,
      author_user_id TEXT,
      task_key TEXT NOT NULL,
      merge_request_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `).then(function () {
    return db.runSql('CREATE UNIQUE INDEX IF NOT EXISTS idx_flaky_review_contexts_review_task ON flaky_review_contexts (review_task_id);');
  }).then(function () {
    return db.runSql('CREATE INDEX IF NOT EXISTS idx_flaky_review_contexts_gitlab_mr ON flaky_review_contexts (gitlab_merge_request_id, is_active);');
  }).then(function () {
    return db.runSql(`
      CREATE TABLE IF NOT EXISTS flaky_test_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        build_id TEXT NOT NULL,
        build_config_id TEXT,
        build_number TEXT,
        build_url TEXT,
        test_name TEXT NOT NULL,
        test_identity TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT,
        stacktrace TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }).then(function () {
    return db.runSql('CREATE UNIQUE INDEX IF NOT EXISTS idx_flaky_test_events_build_test_status ON flaky_test_events (build_id, test_identity, status);');
  }).then(function () {
    return db.runSql('CREATE INDEX IF NOT EXISTS idx_flaky_test_events_identity ON flaky_test_events (test_identity, created_at);');
  }).then(function () {
    return db.runSql(`
      CREATE TABLE IF NOT EXISTS flaky_triage_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_task_id INTEGER NOT NULL,
        test_identity TEXT NOT NULL,
        test_name TEXT NOT NULL,
        build_id TEXT NOT NULL,
        build_url TEXT,
        jira_task_key TEXT,
        prompt_post_id TEXT,
        status TEXT NOT NULL DEFAULT 'waiting',
        confidence REAL,
        classifier_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }).then(function () {
    return db.runSql('CREATE UNIQUE INDEX IF NOT EXISTS idx_flaky_triage_prompts_review_build_test ON flaky_triage_prompts (review_task_id, build_id, test_identity);');
  }).then(function () {
    return db.runSql('CREATE INDEX IF NOT EXISTS idx_flaky_triage_prompts_waiting ON flaky_triage_prompts (review_task_id, status, created_at);');
  });
};

exports.down = function (db) {
  return db.dropTable('flaky_triage_prompts')
    .then(function () {
      return db.dropTable('flaky_test_events');
    }).then(function () {
      return db.dropTable('flaky_review_contexts');
    });
};

exports._meta = {
  "version": 1
};
