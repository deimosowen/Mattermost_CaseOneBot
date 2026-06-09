const userMenuItems = [
    {
        key: 'duty_list',
        title: 'Список дежурств',
        description: 'Просмотр всех текущих дежурств по каналам',
        url: '/duty/list',
        icon: 'bi-list-check',
        color: 'primary',
        section: 'main'
    },
    {
        key: 'calendar_settings',
        title: 'Настройки календаря',
        description: 'Настройка уведомлений и интеграции с Яндекс.Календарем',
        url: '/calendar/settings',
        icon: 'bi-calendar-event',
        color: 'info',
        section: 'main'
    },
    {
        key: 'feature_ready',
        title: 'Feature Ready',
        description: 'Отметка фичи как готовой к релизу',
        url: '/feature',
        icon: 'bi-check-circle',
        color: 'success',
        section: 'main'
    },
    {
        key: 'patch_message',
        title: 'Сообщение о патче',
        description: 'Создание сообщения о патче в канале c1_team_important',
        url: '/patch',
        icon: 'bi-patch-check',
        color: 'success',
        section: 'main'
    },
    {
        key: 'teamcity',
        title: 'TeamCity',
        description: 'Настройка уведомлений о сборках TeamCity',
        url: '/teamcity',
        icon: 'bi-gear',
        color: 'warning',
        section: 'main'
    },
    {
        key: 'invite',
        title: 'Приглашения в каналы',
        description: 'Приглашение пользователей в каналы Mattermost',
        url: '/invite',
        icon: 'bi-people',
        color: 'secondary',
        section: 'main'
    },
    {
        key: 'message_forwarding',
        title: 'Пересылка сообщений',
        description: 'Настройка маршрутов пересылки между каналами',
        url: '/forward',
        icon: 'bi-arrow-left-right',
        color: 'info',
        section: 'main'
    },
    {
        key: 'jira_worklog',
        title: 'Jira Worklog',
        description: 'Учет времени в Jira',
        url: '/jira',
        icon: 'bi-clock',
        color: 'secondary',
        section: 'main'
    },
    {
        key: 'review',
        title: 'Перевод в ревью',
        description: 'Перевод задачи в статус IN REVIEW и отправка в канал',
        url: '/review',
        icon: 'bi-send-check',
        color: 'primary',
        section: 'main'
    },
    {
        key: 'reminders',
        title: 'Управление напоминаниями',
        description: 'Создание и управление напоминаниями по cron-расписанию',
        url: '/reminders',
        icon: 'bi-bell',
        color: 'primary',
        section: 'main'
    },
    {
        key: 'profile',
        title: 'Личный кабинет',
        description: 'Персональные настройки уведомлений и публикаций',
        url: '/profile',
        icon: 'bi-person-circle',
        color: 'secondary',
        section: 'main'
    },
    {
        key: 'commands',
        title: 'Список команд',
        description: 'Полный список всех доступных команд бота с примерами и подсказками',
        url: '/commands',
        icon: 'bi-terminal',
        color: 'info',
        section: 'main'
    }
];

const adminMenuItems = [
    {
        key: 'admin_panel',
        url: '/admin',
        title: 'Админ-панель',
        description: 'Системная информация, логи и быстрые ссылки',
        icon: 'bi-shield-check',
        color: 'danger',
        section: 'admin'
    },
    {
        key: 'admin_users',
        url: '/admin/users',
        title: 'Пользователи и группы',
        description: 'Управление доступом к пунктам меню',
        icon: 'bi-person-gear',
        color: 'danger',
        section: 'admin'
    },
    {
        key: 'admin_invite_channels',
        url: '/admin/invite-channels',
        title: 'Каналы для приглашений',
        description: 'Управление основными каналами и префиксами',
        icon: 'bi-people',
        color: 'danger',
        section: 'admin'
    },
    {
        key: 'admin_review_channels',
        url: '/admin/review-channels',
        title: 'Каналы ревью',
        description: 'Управление каналами для формы перевода задачи в ревью',
        icon: 'bi-check2-square',
        color: 'primary',
        section: 'admin'
    },
    {
        key: 'review_settings',
        url: '/review/settings',
        title: 'Настройки ревью',
        description: 'Настройка автоматического распределения ревьюеров',
        icon: 'bi-check2-square',
        color: 'info',
        section: 'admin'
    }
];

const menuItems = [...userMenuItems, ...adminMenuItems];
const menuKeys = menuItems.map((item) => item.key);
const defaultUserMenuKeys = userMenuItems.map((item) => item.key);
const adminMenuKeys = menuItems.map((item) => item.key);

function getVisibleMenuItems(section, allowedMenuKeys = [], { isAdmin = false } = {}) {
    const allowed = new Set(isAdmin ? adminMenuKeys : allowedMenuKeys);
    return menuItems.filter((item) => item.section === section && allowed.has(item.key));
}

function getMenuKeyForPath(path) {
    if (!path || path === '/') return null;

    if (path === '/review/settings' || path.startsWith('/review/settings/')) {
        return 'review_settings';
    }

    if (path === '/admin') return 'admin_panel';
    if (path.startsWith('/admin/users') || path.startsWith('/admin/api/users') || path.startsWith('/admin/api/groups')) {
        return 'admin_users';
    }
    if (path.startsWith('/admin/invite-channels') || path.startsWith('/admin/api/invite-channels')) {
        return 'admin_invite_channels';
    }
    if (path.startsWith('/admin/review-channels') || path.startsWith('/admin/api/review-channels')) {
        return 'admin_review_channels';
    }
    if (path.startsWith('/admin/api/system-info') || path.startsWith('/admin/api/latest-log')) {
        return 'admin_panel';
    }

    if (path === '/duty' || path.startsWith('/duty/')) return 'duty_list';
    if (path.startsWith('/calendar/')) return 'calendar_settings';
    if (path === '/feature' || path.startsWith('/feature/')) return 'feature_ready';
    if (path === '/patch' || path.startsWith('/patch/')) return 'patch_message';
    if (path === '/teamcity' || path.startsWith('/teamcity/')) return 'teamcity';
    if (path === '/invite' || path.startsWith('/invite/')) return 'invite';
    if (path === '/forward' || path.startsWith('/forward/')) return 'message_forwarding';
    if (path === '/jira' || path.startsWith('/jira/')) return 'jira_worklog';
    if (path === '/review' || path.startsWith('/review/')) return 'review';
    if (path === '/reminders' || path.startsWith('/reminders/')) return 'reminders';
    if (path === '/commands' || path.startsWith('/commands/')) return 'commands';
    if (path === '/profile' || path.startsWith('/profile/')) return 'profile';

    return null;
}

module.exports = {
    menuItems,
    menuKeys,
    userMenuItems,
    adminMenuItems,
    defaultUserMenuKeys,
    adminMenuKeys,
    getVisibleMenuItems,
    getMenuKeyForPath
};
