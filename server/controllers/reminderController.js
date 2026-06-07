const express = require('express');
const logger = require('../../logger');
const { getReminders, getReminderById, addReminder, updateReminderWorkingDays, deleteReminder } = require('../../db/models/reminders');
const { getChannelById } = require('../../mattermost/utils');
const cronValidator = require('cron-validator');
const cronManager = require('../../cron/cronManager');
const CronServiceTypes = require('../../cron/сronServiceTypes');

const router = express.Router();

function parseBoolean(value) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

// Страница управления напоминаниями
router.get('/', async (req, res) => {
    try {
        const reminders = await getReminders();
        
        // Группируем по каналам и получаем информацию о каналах
        const channelsMap = new Map();
        
        for (const reminder of reminders) {
            if (!channelsMap.has(reminder.channel_id)) {
                try {
                    const channel = await getChannelById(reminder.channel_id);
                    channelsMap.set(reminder.channel_id, {
                        id: reminder.channel_id,
                        name: channel ? (channel.display_name || channel.name || reminder.channel_name) : reminder.channel_name,
                        reminders: []
                    });
                } catch (error) {
                    logger.warn(`Could not get channel ${reminder.channel_id}:`, error);
                    channelsMap.set(reminder.channel_id, {
                        id: reminder.channel_id,
                        name: reminder.channel_name || `Канал ${reminder.channel_id}`,
                        reminders: []
                    });
                }
            }
            channelsMap.get(reminder.channel_id).reminders.push(reminder);
        }
        
        const channelsArray = Array.from(channelsMap.values());
        
        res.render('reminders', {
            error: null,
            channels: channelsArray
        });
    } catch (error) {
        logger.error(`Error in reminders page: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).render('reminders', {
            error: 'Ошибка при загрузке данных',
            channels: []
        });
    }
});

// API: Добавление напоминания
router.post('/api/reminders', async (req, res) => {
    try {
        const { channel_id, channel_name, user_id, user_name, schedule, message, use_working_days } = req.body;
        
        if (!channel_id || !schedule || !message) {
            return res.status(400).json({ error: 'Не указаны обязательные поля: channel_id, schedule, message' });
        }
        
        if (!cronValidator.isValidCron(schedule)) {
            return res.status(400).json({ error: `Недопустимое cron-расписание: "${schedule}"` });
        }
        
        logger.debug(`Adding reminder: channel_id=${channel_id}, schedule=${schedule}`);
        const id = await addReminder(
            channel_id,
            channel_name || channel_id,
            user_id || 'system',
            user_name || 'System',
            schedule,
            message,
            parseBoolean(use_working_days)
        );
        logger.info(`Reminder added successfully: id=${id}, channel_id=${channel_id}, schedule=${schedule}`);
        
        // Добавляем задачу в cron
        try {
            const reminderService = cronManager.get(CronServiceTypes.REMINDER);
            if (reminderService) {
                // Получаем все напоминания и находим только что созданное
                const allReminders = await getReminders();
                const newReminder = allReminders.find(r => r.id === id);
                if (newReminder) {
                    reminderService.addJob(newReminder);
                    logger.info(`Reminder job added to cron: id=${id}`);
                }
            }
        } catch (cronError) {
            logger.error(`Failed to add reminder to cron: ${cronError.message}`);
            // Не возвращаем ошибку, так как напоминание уже добавлено в БД
        }
        
        res.json({ success: true, id, message: 'Напоминание добавлено' });
    } catch (error) {
        logger.error(`Error adding reminder: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).json({ error: error.message });
    }
});

// API: Переключение учета рабочих дней
router.patch('/api/reminders/:id/working-days', async (req, res) => {
    try {
        const { id } = req.params;
        const useWorkingDays = parseBoolean(req.body.use_working_days);

        const changes = await updateReminderWorkingDays(parseInt(id), useWorkingDays);
        if (!changes) {
            return res.status(404).json({ error: 'Напоминание не найдено' });
        }

        try {
            const reminderService = cronManager.get(CronServiceTypes.REMINDER);
            const updatedReminder = await getReminderById(parseInt(id));
            if (reminderService && updatedReminder) {
                reminderService.removeJob(parseInt(id));
                reminderService.addJob(updatedReminder);
                logger.info(`Reminder working-days setting updated in cron: id=${id}`);
            }
        } catch (cronError) {
            logger.error(`Failed to refresh reminder cron job: ${cronError.message}`);
        }

        res.json({ success: true, message: 'Настройка рабочих дней обновлена' });
    } catch (error) {
        logger.error(`Error updating reminder working days: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// API: Удаление напоминания
router.delete('/api/reminders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { channel_id } = req.query;
        
        if (!channel_id) {
            return res.status(400).json({ error: 'Не указан channel_id' });
        }
        
        const result = await deleteReminder(parseInt(id), channel_id);
        if (result > 0) {
            // Удаляем задачу из cron
            try {
                const reminderService = cronManager.get(CronServiceTypes.REMINDER);
                if (reminderService) {
                    reminderService.removeJob(parseInt(id));
                    logger.info(`Reminder job removed from cron: id=${id}`);
                }
            } catch (cronError) {
                logger.error(`Failed to remove reminder from cron: ${cronError.message}`);
                // Не возвращаем ошибку, так как напоминание уже удалено из БД
            }
            
            logger.info(`Reminder deleted: id=${id}, channel_id=${channel_id}`);
            res.json({ success: true, message: 'Напоминание удалено' });
        } else {
            res.status(404).json({ error: 'Напоминание не найдено' });
        }
    } catch (error) {
        logger.error(`Error removing reminder: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

