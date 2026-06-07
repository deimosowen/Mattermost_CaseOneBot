const express = require('express');
const moment = require('moment');
const { getMyChannels, getChannelMembers, getChannelMember, addToChannel } = require('../../mattermost/utils');
const { INVITE_DAYS_THRESHOLD } = require('../../config');
const { getInviteChannelsMap, getAllMainChannels } = require('../../db/models/inviteChannels');
const logger = require('../../logger');

const router = express.Router();

async function checkMemberExistence(req, res, next) {
    try {
        const user_id = req.query.user_id || req.user?.mattermostUserId;
        const isMember = await isMemberExist(user_id);
        if (!isMember) {
            return res.status(403).send('You shall not pass! 🧙');
        }
        next();
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).send('Server error');
    }
}

router.use(checkMemberExistence);

router.get('/', async (req, res) => {
    const user_id = req.query?.user_id || req.user?.mattermostUserId;
    try {
        const daysThreshold = INVITE_DAYS_THRESHOLD || 30;

        // Получаем все конфигурации из БД
        const inviteChannelsMap = await getInviteChannelsMap();

        // Собираем все префиксы из всех каналов
        const allPrefixes = new Set();
        for (const prefixes of inviteChannelsMap.values()) {
            prefixes.forEach(prefix => allPrefixes.add(prefix));
        }

        logger.debug(`Found ${allPrefixes.size} unique prefixes: ${Array.from(allPrefixes).join(', ')}`);

        // Если нет конфигураций в БД, возвращаем пустой список
        if (allPrefixes.size === 0) {
            logger.warn('No invite channel configurations found in database');
            return res.render('inviteToChannel', {
                user_id,
                daysThreshold,
                activeChannels: [],
                inactiveChannels: []
            });
        }

        const myChannels = await getMyChannels();

        // Фильтруем каналы по всем префиксам из БД
        const channelPromises = myChannels
            .filter(channel => {
                if (channel.type !== 'P') return false;
                // Проверяем, начинается ли имя канала с любого из префиксов
                return Array.from(allPrefixes).some(prefix =>
                    channel.display_name.startsWith(prefix)
                );
            })
            .map(async (channel) => {
                const members = await getChannelMembers(channel.id);
                const isMember = members.some(member => member.user_id === user_id);
                if (!isMember) {
                    return {
                        id: channel.id,
                        display_name: channel.display_name,
                        last_post_at: channel.last_post_at
                    };
                }
            });

        let channels = await Promise.all(channelPromises);
        channels = channels.filter(channel => channel !== undefined);

        logger.debug(`Found ${channels.length} channels matching prefixes`);

        const thresholdDate = moment().subtract(daysThreshold, 'days');
        const { activeChannels, inactiveChannels } = channels.reduce((acc, channel) => {
            const lastPostDate = moment(channel.last_post_at);
            const targetGroup = lastPostDate.isAfter(thresholdDate) ? 'activeChannels' : 'inactiveChannels';
            acc[targetGroup].push({
                id: channel.id,
                display_name: channel.display_name,
                last_post_at: lastPostDate.format()
            });
            return acc;
        }, { activeChannels: [], inactiveChannels: [] });

        activeChannels.sort((a, b) => a.display_name.localeCompare(b.display_name));
        inactiveChannels.sort((a, b) => a.display_name.localeCompare(b.display_name));

        res.render('inviteToChannel', { user_id, daysThreshold, activeChannels, inactiveChannels });
    } catch (error) {
        logger.error(`Error in invite controller: ${error.message}\nStack trace:\n${error.stack}`);
        res.status(500).render('inviteToChannel', {
            user_id: req.query.user_id,
            daysThreshold: INVITE_DAYS_THRESHOLD || 30,
            activeChannels: [],
            inactiveChannels: []
        });
    }
});

router.post('/', async (req, res) => {
    const { user_id, channel_id } = req.body;
    try {
        await addToChannel(user_id, channel_id);
        res.redirect(`/invite?user_id=${user_id}`);
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
});

async function isMemberExist(user_id) {
    try {
        // Проверяем членство пользователя в любом из основных каналов из БД
        const mainChannelIds = await getAllMainChannels();

        // Если нет конфигураций в БД, возвращаем false (или можно использовать fallback на старую логику)
        if (mainChannelIds.length === 0) {
            logger.warn('No main channels configured in database for invite check');
            return false;
        }

        // Проверяем членство хотя бы в одном из основных каналов
        for (const mainChannelId of mainChannelIds) {
            try {
                const members = await getChannelMembers(mainChannelId);
                if (members.some(member => member.user_id === user_id)) {
                    logger.debug(`User ${user_id} is member of main channel ${mainChannelId}`);
                    return true;
                }
            } catch (error) {
                logger.warn(`Error checking membership in channel ${mainChannelId}:`, error);
            }
        }

        return false;
    } catch (error) {
        logger.error(`Error in isMemberExist: ${error.message}`);
        return false;
    }
}

module.exports = router;