const express = require('express');
const passport = require('passport');
const logger = require('../../logger');

const router = express.Router();

// Инициация авторизации через Яндекс
router.get('/yandex', (req, res, next) => {
    const returnUrl = req.query.returnUrl || '/';
    req.session.returnUrl = returnUrl;
    passport.authenticate('yandex')(req, res, next);
});

// Страница ошибки авторизации
router.get('/error', (req, res) => {
    const errorMessage = req.query.error || 'Не удалось авторизоваться через Яндекс';
    res.status(401).render('authError', {
        errorMessage: errorMessage,
        returnUrl: '/'
    });
});

// Выход из системы
router.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            logger.error('Error during logout:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }
        req.session.destroy((err) => {
            if (err) {
                logger.error('Error destroying session:', err);
            }
            res.redirect('/');
        });
    });
});

// Выход из системы (GET для совместимости)
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            logger.error('Error during logout:', err);
            return res.status(500).send('Logout failed');
        }
        req.session.destroy((err) => {
            if (err) {
                logger.error('Error destroying session:', err);
            }
            res.redirect('/');
        });
    });
});

// Проверка статуса авторизации
router.get('/status', (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        return res.json({
            authenticated: true,
            user: {
                id: req.user.id,
                username: req.user.username,
                displayName: req.user.displayName,
                mattermostUserId: req.user.mattermostUserId
            }
        });
    }
    return res.json({ authenticated: false });
});

module.exports = router;

