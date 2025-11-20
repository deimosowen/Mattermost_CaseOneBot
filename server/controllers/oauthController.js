const express = require('express');
const passport = require('passport');
const yandexService = require('../../services/yandexService');
const logger = require('../../logger');

const router = express.Router();

/**
 * Обработка callback от Яндекса
 * Поддерживает два сценария:
 * 1. OAuth callback для авторизации пользователя (если есть code в query) - через Passport
 * 2. Страница для SDK календаря (если нет code) - для обратной совместимости
 */
router.get('/yandexAuthCallback',
    // Если есть code - это OAuth callback для авторизации пользователя через Passport
    (req, res, next) => {
        if (req.query.code) {
            // OAuth callback для Passport - авторизация пользователя
            // Используем кастомный callback для полного контроля
            logger.debug('Processing OAuth callback with code:', req.query.code);
            const authenticate = passport.authenticate('yandex', {}, (err, user, info) => {
                logger.debug('Passport callback invoked', { hasError: !!err, hasUser: !!user, info });
                if (err) {
                    logger.error('Passport authentication error:', err);
                    const errorMessage = encodeURIComponent(err.message || 'Ошибка авторизации');
                    return res.redirect(`/auth/error?error=${errorMessage}`);
                }
                if (!user) {
                    logger.error('Passport authentication failed: no user', { info });
                    const errorMessage = encodeURIComponent('Не удалось получить данные пользователя');
                    return res.redirect(`/auth/error?error=${errorMessage}`);
                }
                logger.debug('User received in callback:', user.id, user.displayName);
                // Вручную логиним пользователя в сессию
                req.login(user, (loginErr) => {
                    if (loginErr) {
                        logger.error('Error during login:', loginErr);
                        return res.redirect('/auth/error');
                    }
                    logger.debug(`User ${user.id} (${user.displayName}) logged in successfully`);
                    // Явно сохраняем сессию перед переходом к следующему middleware
                    req.session.save((saveErr) => {
                        if (saveErr) {
                            logger.error('Error saving session after login:', saveErr);
                            return res.redirect('/auth/error');
                        }
                        logger.debug(`Session saved for user ${user.id}`);
                        // Переходим к следующему middleware
                        return next();
                    });
                });
            });
            return authenticate(req, res);
        } else {
            // Нет code - это страница для SDK календаря
            return next();
        }
    },
    // Обработка успешной авторизации через Passport
    (req, res, next) => {
        if (req.query.code) {
            // Проверяем авторизацию
            const isAuthenticated = req.isAuthenticated && req.isAuthenticated();
            logger.debug('Checking authentication status:', {
                isAuthenticated,
                hasUser: !!req.user,
                userId: req.user?.id,
                sessionId: req.sessionID
            });

            if (isAuthenticated && req.user) {
                // Успешная авторизация через Passport
                const returnUrl = req.session.returnUrl || '/';
                delete req.session.returnUrl;

                logger.debug(`User ${req.user.id} successfully authenticated via Passport, redirecting to ${returnUrl}`);
                // Сохраняем сессию перед редиректом
                req.session.save((saveErr) => {
                    if (saveErr) {
                        logger.error('Error saving session before redirect:', saveErr);
                    }
                    return res.redirect(returnUrl);
                });
                return;
            } else {
                logger.warn('User not authenticated after login callback', {
                    isAuthenticated,
                    hasUser: !!req.user,
                    sessionId: req.sessionID
                });
            }
        }
        // Продолжаем для SDK календаря
        next();
    },
    // Обработка для SDK календаря (обратная совместимость)
    async (req, res) => {
        try {
            const credentials = yandexService.getCredentials();
            res.render("yandexAuthCallback", {
                credentials: credentials
            });
        } catch (error) {
            logger.error('Error in yandexAuthCallback:', error);
            return res.status(500).send('Bad Request: Something went wrong.');
        }
    }
);

module.exports = router;