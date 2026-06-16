const {
    listUsers,
    listGroups,
    upsertUserAccess,
    deleteUser,
    createGroup,
    updateGroup,
    deleteGroup,
    getMenuItems,
    sanitizeMenuKeys,
} = require('../../db/models/accessControl');
const { ADMIN_ID } = require('../../config');

function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    return value === true || value === 'true' || value === '1' || value === 'on' || value === 1;
}

function parsePermissions(value) {
    if (!value) return [];
    return sanitizeMenuKeys(Array.isArray(value) ? value : [value]);
}

async function getUsersPageData() {
    const [users, groups] = await Promise.all([
        listUsers(),
        listGroups(),
    ]);

    return {
        users,
        groups,
        menuItems: getMenuItems(),
    };
}

async function updateManagedUser(mattermostUserId, data) {
    return upsertUserAccess(mattermostUserId, {
        group_id: parseInt(data.group_id, 10),
        is_enabled: parseBoolean(data.is_enabled, false),
    });
}

async function deleteManagedUser(id) {
    const userId = parseInt(id, 10);
    const users = await listUsers();
    const user = users.find((item) => item.id === userId);

    if (user?.mattermost_user_id && ADMIN_ID && user.mattermost_user_id === ADMIN_ID) {
        const error = new Error('Пользователя из ADMIN_ID нельзя удалить');
        error.statusCode = 400;
        throw error;
    }

    const changes = await deleteUser(userId);
    if (!changes) {
        const error = new Error('Пользователь не найден');
        error.statusCode = 404;
        throw error;
    }

    return changes;
}

async function createAccessGroup(data) {
    return createGroup({
        name: data.name,
        description: data.description,
        is_admin: parseBoolean(data.is_admin, false),
        permissions: parsePermissions(data.permissions),
    });
}

async function updateAccessGroup(id, data) {
    const changes = await updateGroup(parseInt(id, 10), {
        name: data.name,
        description: data.description,
        is_admin: parseBoolean(data.is_admin, false),
        permissions: parsePermissions(data.permissions),
    });

    if (!changes) {
        const error = new Error('Группа не найдена');
        error.statusCode = 404;
        throw error;
    }

    return changes;
}

async function deleteAccessGroup(id) {
    const changes = await deleteGroup(parseInt(id, 10));
    if (!changes) {
        const error = new Error('Группа не найдена');
        error.statusCode = 404;
        throw error;
    }

    return changes;
}

module.exports = {
    getMenuItems,
    getUsersPageData,
    updateManagedUser,
    deleteManagedUser,
    createAccessGroup,
    updateAccessGroup,
    deleteAccessGroup,
};
