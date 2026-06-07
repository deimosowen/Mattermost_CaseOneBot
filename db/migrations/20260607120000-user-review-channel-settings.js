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
    return db.createTable('user_review_channel_exclusions', {
        id: { type: 'int', primaryKey: true, autoIncrement: true },
        user_id: { type: 'text', notNull: true },
        channel_id: { type: 'text', notNull: true },
        created_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') },
        updated_at: { type: 'timestamp', defaultValue: new String('CURRENT_TIMESTAMP') }
    }).then(function () {
        return db.addIndex(
            'user_review_channel_exclusions',
            'user_review_channel_exclusions_user_channel_idx',
            ['user_id', 'channel_id'],
            true
        );
    }).then(function () {
        return db.runSql(`
            INSERT OR IGNORE INTO admin_group_menu_permissions (group_id, menu_key)
            SELECT id, 'profile' FROM admin_groups WHERE name IN ('Администраторы', 'Пользователи');
        `);
    });
};

exports.down = function (db) {
    return db.runSql(`
        DELETE FROM admin_group_menu_permissions WHERE menu_key = 'profile';
    `).then(function () {
        return db.dropTable('user_review_channel_exclusions');
    });
};

exports._meta = {
    version: 1
};
