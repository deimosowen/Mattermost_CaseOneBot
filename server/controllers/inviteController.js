const express = require('express');
const moment = require('moment');
const { getMyChannels, getChannelMembers, getChannelMember, addToChannel } = require('../../mattermost/utils');
const { TEAM_CHANNEL_ID, TEAM_CHANNEL_PREFIX, INVITE_DAYS_THRESHOLD } = require('../../config');
const logger = require('../../logger');

const router = express.Router();

async function checkMemberExistence(req, res, next) {
    try {
        const user_id = req.query.user_id || req.body.user_id;
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
    const { user_id } = req.query;
    try {
        const channelPrefix = TEAM_CHANNEL_PREFIX;
        const daysThreshold = INVITE_DAYS_THRESHOLD || 30;
        const myChannels = await getMyChannels();
        const channelPromises = myChannels
            .filter(channel => channel.type === 'P' && channel.display_name.startsWith(channelPrefix))
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
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
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
    const members = await getChannelMembers(TEAM_CHANNEL_ID);
    return members.some(member => member.user_id === user_id);
}

module.exports = router;