const express = require('express');

const router = express.Router();

// Страница со списком всех команд
router.get('/', (req, res) => {
    const commandCategories = [
        {
            title: 'Напоминания',
            icon: 'bi-bell',
            color: 'primary',
            commands: [
                {
                    command: '!reminder',
                    syntax: '!reminder ; cron-расписание ; сообщение',
                    description: 'Устанавливает новое напоминание по cron-расписанию',
                    example: '!reminder ; 0 9 * * 1-5 ; Время для ежедневного стендапа!',
                    help: 'Напоминания работают в UTC-поясе. Cron-расписание состоит из 5 полей: минуты, часы, день месяца, месяц, день недели.'
                },
                {
                    command: '!reminder-list',
                    syntax: '!reminder-list',
                    description: 'Показывает все установленные напоминания в текущем канале',
                    example: '!reminder-list',
                    help: 'Отображает список всех активных напоминаний с их ID, расписанием и сообщением.'
                },
                {
                    command: '!reminder-remove',
                    syntax: '!reminder-remove ; id',
                    description: 'Удаляет напоминание с указанным ID',
                    example: '!reminder-remove ; 3',
                    help: 'Удаляет напоминание. ID можно узнать из списка напоминаний.'
                },
                {
                    command: '!reminder-help',
                    syntax: '!reminder-help',
                    description: 'Показывает справку по командам напоминаний',
                    example: '!reminder-help',
                    help: 'Выводит подробную информацию о всех командах для работы с напоминаниями.'
                }
            ]
        },
        {
            title: 'Дежурства',
            icon: 'bi-calendar-check',
            color: 'success',
            commands: [
                {
                    command: '!duty',
                    syntax: '!duty ; cron-расписание ; список-пользователей',
                    description: 'Устанавливает график дежурства',
                    example: '!duty ; 0 9 * * 1 ; @user1, @user2, @user3',
                    help: 'Список пользователей должен быть разделен запятыми. Дежурство ротируется автоматически по расписанию.'
                },
                {
                    command: '!duty-remove',
                    syntax: '!duty-remove',
                    description: 'Удаляет график дежурства для текущего канала',
                    example: '!duty-remove',
                    help: 'Удаляет все настройки дежурства для текущего канала.'
                },
                {
                    command: '!duty-current',
                    syntax: '!duty-current',
                    description: 'Показывает текущего дежурного в канале',
                    example: '!duty-current',
                    help: 'Отображает информацию о текущем дежурном пользователе.'
                },
                {
                    command: '!duty-next',
                    syntax: '!duty-next',
                    description: 'Переключает на следующего дежурного в канале',
                    example: '!duty-next',
                    help: 'Вручную переключает дежурство на следующего пользователя в списке.'
                },
                {
                    command: '!duty-help',
                    syntax: '!duty-help',
                    description: 'Показывает справку по командам дежурств',
                    example: '!duty-help',
                    help: 'Выводит подробную информацию о всех командах для работы с дежурствами.'
                },
                {
                    command: '!stat',
                    syntax: '!stat',
                    description: 'Показывает статистику дежурств',
                    example: '!stat',
                    help: 'Отображает статистику по дежурствам в канале.'
                }
            ]
        },
        {
            title: 'Пересылка сообщений',
            icon: 'bi-arrow-left-right',
            color: 'info',
            commands: [
                {
                    command: '!forward',
                    syntax: '!forward ; source_channel_id ; target_channel_id ; [дополнительное_сообщение] ; [thread_message]',
                    description: 'Добавляет пересылку сообщений из исходного канала в целевой',
                    example: '!forward ; general ; support ; Обратите внимание ; Благодарим за обращение!',
                    help: 'Все сообщения из исходного канала будут автоматически пересылаться в целевой канал.'
                },
                {
                    command: '!forward-list',
                    syntax: '!forward-list',
                    description: 'Показывает список всех активных пересылок',
                    example: '!forward-list',
                    help: 'Отображает все настроенные пересылки для текущего канала.'
                },
                {
                    command: '!forward-remove',
                    syntax: '!forward-remove ; id',
                    description: 'Удаляет пересылку по указанному ID',
                    example: '!forward-remove ; 5',
                    help: 'Удаляет пересылку. ID можно узнать из списка пересылок.'
                },
                {
                    command: '!forward-help',
                    syntax: '!forward-help',
                    description: 'Показывает справку по командам пересылки',
                    example: '!forward-help',
                    help: 'Выводит подробную информацию о всех командах для работы с пересылкой сообщений.'
                }
            ]
        },
        {
            title: 'Календарь',
            icon: 'bi-calendar-event',
            color: 'warning',
            commands: [
                {
                    command: '!calendar',
                    syntax: '!calendar или !calendar-settings',
                    description: 'Настройка интеграции с Яндекс.Календарем',
                    example: '!calendar',
                    help: 'Открывает настройки для подключения Яндекс.Календаря и настройки уведомлений.'
                },
                {
                    command: '!calendar-remove',
                    syntax: '!calendar-remove',
                    description: 'Удаляет подключение календаря',
                    example: '!calendar-remove',
                    help: 'Отключает интеграцию с Яндекс.Календарем для текущего пользователя.'
                },
                {
                    command: '!meet',
                    syntax: '!meet',
                    description: 'Создает встречу в календаре',
                    example: '!meet',
                    help: 'Помогает создать встречу в Яндекс.Календаре.'
                }
            ]
        },
        {
            title: 'Приглашения',
            icon: 'bi-people',
            color: 'secondary',
            commands: [
                {
                    command: '!invite',
                    syntax: '!invite ; channel-link или channel-name',
                    description: 'Приглашает пользователя в указанный канал',
                    example: '!invite ; general или !invite ; https://mattermost.example.com/channels/general',
                    help: 'Можно использовать либо ссылку на канал, либо название канала.'
                }
            ]
        },
        {
            title: 'Jira',
            icon: 'bi-check-square',
            color: 'dark',
            commands: [
                {
                    command: '!jira',
                    syntax: '!jira',
                    description: 'Работа с задачами Jira',
                    example: '!jira',
                    help: 'Открывает интерфейс для работы с задачами Jira и учета времени.'
                }
            ]
        },
        {
            title: 'Ревью',
            icon: 'bi-check2-square',
            color: 'primary',
            commands: [
                {
                    command: '!review',
                    syntax: '!review',
                    description: 'Перевод задачи в статус IN REVIEW',
                    example: '!review',
                    help: 'Переводит задачу в статус ревью и отправляет уведомление в канал.'
                },
                {
                    command: '!review-settings',
                    syntax: '!review-settings',
                    description: 'Настройка автоматического распределения ревьюеров',
                    example: '!review-settings',
                    help: 'Настройка правил автоматического назначения ревьюеров для задач.'
                }
            ]
        },
        {
            title: 'Утилиты',
            icon: 'bi-tools',
            color: 'secondary',
            commands: [
                {
                    command: '!ping',
                    syntax: '!ping',
                    description: 'Проверка работоспособности бота',
                    example: '!ping',
                    help: 'Бот отвечает "Pong" для проверки работоспособности.'
                },
                {
                    command: '!r',
                    syntax: '!r',
                    description: 'Удаление сообщения',
                    example: '!r',
                    help: 'Удаляет сообщение, на которое был дан ответ.'
                },
                {
                    command: '!sendAs',
                    syntax: '!sendAs',
                    description: 'Отправка сообщения от имени бота',
                    example: '!sendAs',
                    help: 'Позволяет отправить сообщение от имени бота.'
                },
                {
                    command: '!reop',
                    syntax: '!reop',
                    description: 'Переоткрытие задачи',
                    example: '!reop',
                    help: 'Переоткрывает закрытую задачу.'
                },
                {
                    command: '!log',
                    syntax: '!log',
                    description: 'Просмотр логов',
                    example: '!log',
                    help: 'Показывает последние логи работы бота.'
                }
            ]
        }
    ];

    res.render('commands', {
        commandCategories
    });
});

module.exports = router;

