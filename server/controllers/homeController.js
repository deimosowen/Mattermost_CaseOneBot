const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
    // Проверяем, является ли пользователь админом
    const isAdmin = res.locals.user?.isAdmin || false;
    
    // Список доступных страниц для авторизованных пользователей
    const availablePages = [
        {
            title: 'Список дежурств',
            description: 'Просмотр всех текущих дежурств по каналам',
            url: '/duty/list',
            icon: 'bi-list-check',
            color: 'primary'
        },
        {
            title: 'Настройки календаря',
            description: 'Настройка уведомлений и интеграции с Яндекс.Календарем',
            url: '/calendar/settings',
            icon: 'bi-calendar-event',
            color: 'info'
        },
        {
            title: 'Feature Ready',
            description: 'Отметка фичи как готовой к релизу',
            url: '/feature',
            icon: 'bi-check-circle',
            color: 'success'
        },
        {
            title: 'TeamCity',
            description: 'Настройка уведомлений о сборках TeamCity',
            url: '/teamcity',
            icon: 'bi-gear',
            color: 'warning'
        },
        {
            title: 'Приглашения в каналы',
            description: 'Приглашение пользователей в каналы Mattermost',
            url: '/invite',
            icon: 'bi-people',
            color: 'secondary'
        },
        {
            title: 'Jira Worklog',
            description: 'Учет времени в Jira',
            url: '/jira',
            icon: 'bi-clock',
            color: 'secondary'
        },
        {
            title: 'Настройки ревью',
            description: 'Настройка автоматического распределения ревьюеров',
            url: '/review/settings',
            icon: 'bi-check2-square',
            color: 'info'
        },
        {
            title: 'Перевод в ревью',
            description: 'Перевод задачи в статус IN REVIEW и отправка в канал',
            url: '/review',
            icon: 'bi-send-check',
            color: 'primary'
        }
    ];

    res.render('home', {
        availablePages: availablePages,
        isAdmin: isAdmin
    });
});

router.get('/PrivacyPolicy', (req, res) => {
    res.redirect('https://github.com/deimosowen/Mattermost_CaseOneBot/blob/main/PrivacyPolicy.md');
});

module.exports = router;