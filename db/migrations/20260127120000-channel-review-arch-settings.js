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
    return db.addColumn('channel_review_settings', 'allow_arch_review', {
        type: 'boolean',
        defaultValue: false
    }).then(function () {
        return db.addColumn('channel_review_settings', 'arch_review_tag', {
            type: 'text',
            defaultValue: ''
        });
    });
};

exports.down = function (db) {
    return db.removeColumn('channel_review_settings', 'arch_review_tag').then(function () {
        return db.removeColumn('channel_review_settings', 'allow_arch_review');
    });
};

exports._meta = {
    "version": 1
};
