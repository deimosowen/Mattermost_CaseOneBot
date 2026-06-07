const db = require('../index.js');
const { ADMIN_ID } = require('../../config');
const logger = require('../../logger');
const {
    menuItems,
    menuKeys,
    defaultUserMenuKeys,
    adminMenuKeys
} = require('../../server/menuRegistry');

const ADMIN_GROUP_NAME = 'Администраторы';
const USER_GROUP_NAME = 'Пользователи';

function isAccessTableMissing(error) {
    return /no such table: (admin_(groups|users|group_menu_permissions)|user_info)/i.test(error?.message || '');
}

function toBool(value) {
    return value === true || value === 1 || value === '1';
}

function sanitizeMenuKeys(keys = []) {
    const validKeys = new Set(menuKeys);
    return [...new Set(keys)].filter((key) => validKeys.has(key));
}

function fallbackAccess(mattermostUserId) {
    const isConfiguredAdmin = Boolean(ADMIN_ID && mattermostUserId && mattermostUserId === ADMIN_ID);
    return {
        user: null,
        group: null,
        isAdmin: isConfiguredAdmin,
        isEnabled: true,
        allowedMenuKeys: isConfiguredAdmin ? adminMenuKeys : defaultUserMenuKeys
    };
}

async function safeAccessQuery(defaultValue, callback) {
    try {
        return await callback();
    } catch (error) {
        if (isAccessTableMissing(error)) {
            return defaultValue;
        }

        logger.error(`Access control query failed: ${error.message}`);
        return defaultValue;
    }
}

async function getGroupByName(name) {
    return safeAccessQuery(null, () => db.get('SELECT * FROM admin_groups WHERE name = ?', [name]));
}

async function getGroupById(id) {
    return safeAccessQuery(null, () => db.get('SELECT * FROM admin_groups WHERE id = ?', [id]));
}

async function ensureDefaultGroups() {
    return safeAccessQuery(false, async () => {
        await db.runAsync(
            `INSERT OR IGNORE INTO admin_groups (name, description, is_admin, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [ADMIN_GROUP_NAME, 'Полный доступ ко всем разделам и административным настройкам', 1]
        );
        await db.runAsync(
            `INSERT OR IGNORE INTO admin_groups (name, description, is_admin, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [USER_GROUP_NAME, 'Базовый доступ к пользовательским разделам', 0]
        );

        const adminGroup = await getGroupByName(ADMIN_GROUP_NAME);
        const userGroup = await getGroupByName(USER_GROUP_NAME);

        if (adminGroup) {
            const permissions = await getPermissionsForGroup(adminGroup.id);
            if (permissions.length === 0) {
                await addPermissions(adminGroup.id, adminMenuKeys);
            }
        }
        if (userGroup) {
            const permissions = await getPermissionsForGroup(userGroup.id);
            if (permissions.length === 0) {
                await addPermissions(userGroup.id, defaultUserMenuKeys);
            }
        }
        return true;
    });
}

async function addPermissions(groupId, keys) {
    const normalizedKeys = sanitizeMenuKeys(keys);
    for (const menuKey of normalizedKeys) {
        await db.runAsync(
            `INSERT OR IGNORE INTO admin_group_menu_permissions (group_id, menu_key)
             VALUES (?, ?)`,
            [groupId, menuKey]
        );
    }
}

async function getPermissionsForGroup(groupId) {
    if (!groupId) return [];

    const rows = await safeAccessQuery([], () => db.all(
        `SELECT menu_key
         FROM admin_group_menu_permissions
         WHERE group_id = ?
         ORDER BY menu_key`,
        [groupId]
    ));

    return rows.map((row) => row.menu_key);
}

async function getLatestUserInfoRows() {
    return safeAccessQuery([], () => db.all(
        `SELECT
            ui.user_id AS mattermost_user_id,
            NULLIF(ui.login, '') AS username,
            COALESCE(
                NULLIF(ui.display_name, ''),
                NULLIF(ui.real_name, ''),
                NULLIF(TRIM(COALESCE(ui.first_name, '') || ' ' || COALESCE(ui.last_name, '')), ''),
                NULLIF(ui.login, ''),
                ui.user_id
            ) AS display_name,
            NULLIF(ui.default_email, '') AS email
         FROM user_info ui
         INNER JOIN (
            SELECT user_id, MAX(id) AS id
            FROM user_info
            GROUP BY user_id
         ) latest ON latest.id = ui.id
         WHERE ui.user_id IS NOT NULL AND TRIM(ui.user_id) != ''`
    ));
}

async function syncUserInfoAccessRows() {
    const ensured = await ensureDefaultGroups();
    if (!ensured) return;

    const [adminGroup, userGroup, knownUsers] = await Promise.all([
        getGroupByName(ADMIN_GROUP_NAME),
        getGroupByName(USER_GROUP_NAME),
        getLatestUserInfoRows()
    ]);

    if (!userGroup || knownUsers.length === 0) return;

    for (const knownUser of knownUsers) {
        const existing = await db.get(
            'SELECT * FROM admin_users WHERE mattermost_user_id = ?',
            [knownUser.mattermost_user_id]
        );

        if (existing) {
            await db.runAsync(
                `UPDATE admin_users
                 SET username = ?, display_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    knownUser.username || existing.username,
                    knownUser.display_name || existing.display_name,
                    knownUser.email || existing.email,
                    existing.id
                ]
            );
            continue;
        }

        const isConfiguredAdmin = Boolean(ADMIN_ID && knownUser.mattermost_user_id === ADMIN_ID);
        const groupId = isConfiguredAdmin && adminGroup ? adminGroup.id : userGroup.id;

        await db.runAsync(
            `INSERT OR IGNORE INTO admin_users
                (mattermost_user_id, username, display_name, email, group_id, is_enabled, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
            [
                knownUser.mattermost_user_id,
                knownUser.username || null,
                knownUser.display_name || knownUser.mattermost_user_id,
                knownUser.email || null,
                groupId
            ]
        );
    }
}

async function getAccessForUser(mattermostUserId) {
    if (!mattermostUserId) {
        return fallbackAccess(null);
    }

    const isConfiguredAdmin = Boolean(ADMIN_ID && mattermostUserId === ADMIN_ID);
    const access = await safeAccessQuery(null, async () => {
        const user = await db.get(
            `SELECT u.*, g.name AS group_name, g.description AS group_description, g.is_admin AS group_is_admin
             FROM admin_users u
             LEFT JOIN admin_groups g ON g.id = u.group_id
             WHERE u.mattermost_user_id = ?`,
            [mattermostUserId]
        );

        if (!user && !isConfiguredAdmin) {
            return fallbackAccess(mattermostUserId);
        }

        const allowedMenuKeys = user?.group_id
            ? await getPermissionsForGroup(user.group_id)
            : [];

        const isEnabled = isConfiguredAdmin || !user || toBool(user.is_enabled);
        const isAdmin = isConfiguredAdmin || toBool(user?.group_is_admin);
        return {
            user,
            group: user?.group_id ? {
                id: user.group_id,
                name: user.group_name,
                description: user.group_description,
                is_admin: toBool(user.group_is_admin)
            } : null,
            isAdmin,
            isEnabled,
            allowedMenuKeys: isEnabled ? (isAdmin ? adminMenuKeys : allowedMenuKeys) : []
        };
    });

    return access || fallbackAccess(mattermostUserId);
}

async function syncAuthenticatedUser(sessionUser) {
    const mattermostUserId = sessionUser?.mattermostUserId;
    if (!mattermostUserId) {
        return fallbackAccess(null);
    }

    const ensured = await ensureDefaultGroups();
    if (!ensured) {
        return fallbackAccess(mattermostUserId);
    }

    const isConfiguredAdmin = Boolean(ADMIN_ID && mattermostUserId === ADMIN_ID);

    await safeAccessQuery(null, async () => {
        const existing = await db.get(
            'SELECT * FROM admin_users WHERE mattermost_user_id = ?',
            [mattermostUserId]
        );

        if (existing) {
            await db.runAsync(
                `UPDATE admin_users
                 SET username = ?, display_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    sessionUser.username || existing.username,
                    sessionUser.displayName || existing.display_name,
                    sessionUser.email || existing.email,
                    existing.id
                ]
            );
            return;
        }

        const group = await getGroupByName(isConfiguredAdmin ? ADMIN_GROUP_NAME : USER_GROUP_NAME);
        await db.runAsync(
            `INSERT INTO admin_users
                (mattermost_user_id, username, display_name, email, group_id, is_enabled, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
            [
                mattermostUserId,
                sessionUser.username || null,
                sessionUser.displayName || sessionUser.username || null,
                sessionUser.email || null,
                group?.id || null
            ]
        );
    });

    return getAccessForUser(mattermostUserId);
}

async function listGroups() {
    await syncUserInfoAccessRows();

    const groups = await safeAccessQuery([], () => db.all(
        `SELECT g.*,
                COUNT(u.id) AS users_count
         FROM admin_groups g
         LEFT JOIN admin_users u ON u.group_id = g.id
         GROUP BY g.id
         ORDER BY g.is_admin DESC, g.name ASC`
    ));

    return Promise.all(groups.map(async (group) => ({
        ...group,
        is_admin: toBool(group.is_admin),
        permissions: await getPermissionsForGroup(group.id),
        users_count: Number(group.users_count || 0)
    })));
}

async function listUsers() {
    await syncUserInfoAccessRows();

    const users = await safeAccessQuery([], () => db.all(
        `WITH latest_user_info AS (
            SELECT ui.*
            FROM user_info ui
            INNER JOIN (
                SELECT user_id, MAX(id) AS id
                FROM user_info
                GROUP BY user_id
            ) latest ON latest.id = ui.id
        )
         SELECT
            au.id AS access_id,
            ui.id AS user_info_id,
            ui.user_id AS mattermost_user_id,
            COALESCE(au.username, NULLIF(ui.login, '')) AS username,
            COALESCE(
                au.display_name,
                NULLIF(ui.display_name, ''),
                NULLIF(ui.real_name, ''),
                NULLIF(TRIM(COALESCE(ui.first_name, '') || ' ' || COALESCE(ui.last_name, '')), ''),
                NULLIF(ui.login, ''),
                ui.user_id
            ) AS display_name,
            COALESCE(au.email, NULLIF(ui.default_email, '')) AS email,
            au.group_id,
            COALESCE(au.is_enabled, 1) AS is_enabled,
            g.name AS group_name,
            g.is_admin AS group_is_admin,
            1 AS from_user_info
         FROM latest_user_info ui
         LEFT JOIN admin_users au ON au.mattermost_user_id = ui.user_id
         LEFT JOIN admin_groups g ON g.id = au.group_id
         UNION ALL
         SELECT
            au.id AS access_id,
            NULL AS user_info_id,
            au.mattermost_user_id,
            au.username,
            COALESCE(au.display_name, au.username, au.mattermost_user_id) AS display_name,
            au.email,
            au.group_id,
            au.is_enabled,
            g.name AS group_name,
            g.is_admin AS group_is_admin,
            0 AS from_user_info
         FROM admin_users au
         LEFT JOIN latest_user_info ui ON ui.user_id = au.mattermost_user_id
         LEFT JOIN admin_groups g ON g.id = au.group_id
         WHERE ui.user_id IS NULL
         ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE, mattermost_user_id`
    ));

    return users.map((user) => ({
        ...user,
        id: user.access_id,
        is_enabled: toBool(user.is_enabled),
        group_is_admin: toBool(user.group_is_admin),
        is_configured_admin: Boolean(ADMIN_ID && user.mattermost_user_id === ADMIN_ID),
        from_user_info: toBool(user.from_user_info)
    }));
}

async function getKnownUserForAccess(mattermostUserId) {
    return safeAccessQuery(null, () => db.get(
        `SELECT
            ui.user_id AS mattermost_user_id,
            NULLIF(ui.login, '') AS username,
            COALESCE(
                NULLIF(ui.display_name, ''),
                NULLIF(ui.real_name, ''),
                NULLIF(TRIM(COALESCE(ui.first_name, '') || ' ' || COALESCE(ui.last_name, '')), ''),
                NULLIF(ui.login, ''),
                ui.user_id
            ) AS display_name,
            NULLIF(ui.default_email, '') AS email
         FROM user_info ui
         WHERE ui.user_id = ?
         ORDER BY ui.id DESC
         LIMIT 1`,
        [mattermostUserId]
    ));
}

async function upsertUserAccess(mattermostUserId, { group_id, is_enabled }) {
    const normalizedUserId = String(mattermostUserId || '').trim();
    if (!normalizedUserId) {
        throw new Error('Mattermost User ID is required');
    }

    await ensureDefaultGroups();
    const group = await getGroupById(group_id);
    if (!group) {
        throw new Error('Группа не найдена');
    }

    const knownUser = await getKnownUserForAccess(normalizedUserId);
    const existing = await db.get(
        'SELECT * FROM admin_users WHERE mattermost_user_id = ?',
        [normalizedUserId]
    );

    if (!knownUser && !existing) {
        throw new Error('Пользователь не найден в user_info');
    }

    if (existing) {
        const result = await db.runAsync(
            `UPDATE admin_users
             SET username = ?, display_name = ?, email = ?, group_id = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                knownUser?.username || existing.username,
                knownUser?.display_name || existing.display_name,
                knownUser?.email || existing.email,
                group.id,
                is_enabled ? 1 : 0,
                existing.id
            ]
        );
        return { id: existing.id, changes: result.changes };
    }

    const result = await db.runAsync(
        `INSERT INTO admin_users
            (mattermost_user_id, username, display_name, email, group_id, is_enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            knownUser.mattermost_user_id,
            knownUser.username || null,
            knownUser.display_name || knownUser.mattermost_user_id,
            knownUser.email || null,
            group.id,
            is_enabled ? 1 : 0
        ]
    );

    return { id: result.lastID, changes: 1 };
}

async function createOrUpdateUser(userData) {
    const mattermostUserId = String(userData.mattermost_user_id || '').trim();
    if (!mattermostUserId) {
        throw new Error('Mattermost User ID is required');
    }

    await ensureDefaultGroups();
    const group = await getGroupById(userData.group_id);
    if (!group) {
        throw new Error('Группа не найдена');
    }

    const existing = await db.get(
        'SELECT * FROM admin_users WHERE mattermost_user_id = ?',
        [mattermostUserId]
    );

    if (existing) {
        await db.runAsync(
            `UPDATE admin_users
             SET username = ?, display_name = ?, email = ?, group_id = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                userData.username || existing.username,
                userData.display_name || existing.display_name,
                userData.email || existing.email,
                group.id,
                userData.is_enabled ? 1 : 0,
                existing.id
            ]
        );
        return existing.id;
    }

    const result = await db.runAsync(
        `INSERT INTO admin_users
            (mattermost_user_id, username, display_name, email, group_id, is_enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
            mattermostUserId,
            userData.username || null,
            userData.display_name || userData.username || mattermostUserId,
            userData.email || null,
            group.id,
            userData.is_enabled ? 1 : 0
        ]
    );

    return result.lastID;
}

async function updateUserAccess(id, { group_id, is_enabled }) {
    const group = await getGroupById(group_id);
    if (!group) {
        throw new Error('Группа не найдена');
    }

    const result = await db.runAsync(
        `UPDATE admin_users
         SET group_id = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [group.id, is_enabled ? 1 : 0, id]
    );

    return result.changes;
}

async function deleteUser(id) {
    const result = await db.runAsync('DELETE FROM admin_users WHERE id = ?', [id]);
    return result.changes;
}

async function createGroup({ name, description, is_admin, permissions }) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
        throw new Error('Название группы обязательно');
    }

    return db.transaction(async () => {
        const result = await db.runAsync(
            `INSERT INTO admin_groups (name, description, is_admin, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [normalizedName, description || null, is_admin ? 1 : 0]
        );
        await replaceGroupPermissions(result.lastID, permissions || []);
        return result.lastID;
    });
}

async function updateGroup(id, { name, description, is_admin, permissions }) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
        throw new Error('Название группы обязательно');
    }

    return db.transaction(async () => {
        const result = await db.runAsync(
            `UPDATE admin_groups
             SET name = ?, description = ?, is_admin = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [normalizedName, description || null, is_admin ? 1 : 0, id]
        );
        await replaceGroupPermissions(id, permissions || []);
        return result.changes;
    });
}

async function replaceGroupPermissions(groupId, permissions) {
    const normalizedKeys = sanitizeMenuKeys(permissions);
    await db.runAsync(
        'DELETE FROM admin_group_menu_permissions WHERE group_id = ?',
        [groupId]
    );

    for (const menuKey of normalizedKeys) {
        await db.runAsync(
            `INSERT INTO admin_group_menu_permissions (group_id, menu_key)
             VALUES (?, ?)`,
            [groupId, menuKey]
        );
    }
}

async function deleteGroup(id) {
    const group = await getGroupById(id);
    if (!group) {
        return 0;
    }
    if ([ADMIN_GROUP_NAME, USER_GROUP_NAME].includes(group.name)) {
        throw new Error('Базовую группу нельзя удалить');
    }

    return db.transaction(async () => {
        const users = await db.get(
            'SELECT COUNT(*) AS count FROM admin_users WHERE group_id = ?',
            [id]
        );
        if (Number(users?.count || 0) > 0) {
            throw new Error('Нельзя удалить группу, в которой есть пользователи');
        }

        await db.runAsync('DELETE FROM admin_group_menu_permissions WHERE group_id = ?', [id]);
        const result = await db.runAsync('DELETE FROM admin_groups WHERE id = ?', [id]);
        return result.changes;
    });
}

function getMenuItems() {
    return menuItems;
}

module.exports = {
    ADMIN_GROUP_NAME,
    USER_GROUP_NAME,
    getAccessForUser,
    syncAuthenticatedUser,
    listGroups,
    listUsers,
    upsertUserAccess,
    createOrUpdateUser,
    updateUserAccess,
    deleteUser,
    createGroup,
    updateGroup,
    deleteGroup,
    getMenuItems,
    sanitizeMenuKeys
};
