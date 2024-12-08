const { getUser, getAllUsers, updateUser, updateUserInfo, removeUser } = require('../../db/models/calendars');
const { getMe, getUser: getUserInMattermost, createDirectChannel } = require('../../mattermost/utils');
const { HOST, YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, YANDEX_REDIRECT_URI } = require('../../config');
const logger = require('../../logger');

class YandexService {
    getCredentials() {
        return {
            origin: HOST,
            client_id: YANDEX_CLIENT_ID,
            client_secret: YANDEX_CLIENT_SECRET,
            redirect_uri: YANDEX_REDIRECT_URI
        };
    };

    async isAuthenticated(userId) {
        const user = await getUser(userId);
        if (user && user.access_token) {
            return true;
        }
        return false;
    };

    async createAuthUser(userId, tokens) {
        const userBot = await getMe();
        const user = await getUserInMattermost(userId);
        const userInfo = await this.getUserInfo(tokens);
        const channel = await createDirectChannel([user.id, userBot.id]);
        await updateUser(userId, channel.id, tokens);
        await updateUserInfo(userId, userInfo);
    };

    async removeAuthUser(userId) {
        const user = await getUser(userId);
        if (user) {
            await removeUser(userId);
        }
    };

    async getUserInfo(tokens) {
        const response = await fetch('https://login.yandex.ru/info?format=json', {
            method: 'GET',
            headers: {
                'Authorization': `OAuth ${tokens.access_token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Error fetching user info: ${response.statusText}`);
        }

        const userInfo = await response.json();
        return userInfo;
    }


    async getUserTokens(userId) {
        const user = await getUser(userId);

        if (!user || !user.access_token) {
            throw new Error(`Пользователь ${userId} не авторизован или токен отсутствует`);
        }

        return user;
    };

    async getAllUsersTokens() {
        return getAllUsers();
    }
}

module.exports = new YandexService();