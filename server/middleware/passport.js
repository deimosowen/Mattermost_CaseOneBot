const passport = require('passport');
const YandexStrategy = require('passport-yandex').Strategy;
const { YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, HOST, ALLOWED_EMAIL_DOMAINS } = require('../../config');
const { getUserByEmail } = require('../../mattermost/utils');
const logger = require('../../logger');

// Сериализация пользователя в сессию
// Сохраняем основные данные пользователя для быстрого доступа
passport.serializeUser((user, done) => {
    // Сохраняем только необходимые данные для десериализации
    done(null, {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.emails?.[0]?.value,
        photo: user.photos?.[0]?.value,
        mattermostUserId: user.mattermostUserId // ID пользователя в Mattermost
    });
});

// Десериализация пользователя из сессии
passport.deserializeUser((userData, done) => {
    // userData уже содержит все необходимые данные из сериализации
    done(null, userData);
});

// Настройка Яндекс OAuth стратегии
passport.use(new YandexStrategy({
    clientID: YANDEX_CLIENT_ID,
    clientSecret: YANDEX_CLIENT_SECRET,
    callbackURL: `${HOST}/oauth/yandexAuthCallback`
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Проверяем email домен
        const userEmail = profile.emails?.[0]?.value;
        if (!userEmail) {
            logger.warn(`User ${profile.id} has no email`);
            return done(new Error('Email не найден в профиле Яндекс'), null);
        }

        // Проверяем, разрешен ли домен email
        const emailDomain = userEmail.split('@')[1];
        const isAllowed = ALLOWED_EMAIL_DOMAINS.some(domain =>
            emailDomain.toLowerCase() === domain.toLowerCase()
        );

        if (!isAllowed) {
            logger.warn(`User ${profile.id} (${userEmail}) tried to authenticate with unauthorized domain`);
            return done(new Error(`Доступ разрешен только для доменов: ${ALLOWED_EMAIL_DOMAINS.join(', ')}`), null);
        }

        // Ищем пользователя в Mattermost по email
        let mattermostUser = null;
        let mattermostUserId = null;
        try {
            mattermostUser = await getUserByEmail(userEmail);
            if (mattermostUser) {
                mattermostUserId = mattermostUser.id;
                logger.debug(`Found Mattermost user for ${userEmail}: ${mattermostUserId} (${mattermostUser.username})`);
            } else {
                logger.warn(`Mattermost user not found for email: ${userEmail}`);
            }
        } catch (error) {
            logger.warn(`Error searching Mattermost user by email ${userEmail}:`, error.message);
            // Не блокируем авторизацию, если не удалось найти пользователя в Mattermost
        }

        // profile содержит информацию о пользователе из Яндекса
        const user = {
            id: profile.id,
            username: profile.username,
            displayName: profile.displayName,
            emails: profile.emails,
            photos: profile.photos,
            accessToken, // Сохраняем токен для дальнейшего использования
            refreshToken,
            mattermostUserId // ID пользователя в Mattermost
        };

        logger.debug(`User authenticated via Yandex: ${profile.id} (${profile.displayName}) - ${userEmail}${mattermostUserId ? ` [Mattermost: ${mattermostUserId}]` : ' [Mattermost: not found]'}`);
        return done(null, user);
    } catch (error) {
        logger.error('Error in Yandex OAuth strategy:', error);
        return done(error, null);
    }
}));

module.exports = passport;