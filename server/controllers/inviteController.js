const express = require('express');
const { getMyChannels, getChannelMembers, getChannelMember, addToChannel } = require('../../mattermost/utils');
const { TEAM_CHANNEL_ID } = require('../../config');
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
        const myChannels = await getMyChannels();
        const channelPromises = myChannels
            .filter(channel => channel.type === 'P')
            .map(async (channel) => {
                const member = await getChannelMember(channel.id, user_id);
                if (!member) {
                    return {
                        id: channel.id,
                        display_name: channel.display_name,
                    };
                }
            });

        let channels = await Promise.all(channelPromises);
        channels = channels.filter(channel => channel !== undefined);
        res.render('inviteToChannel', { user_id, channels });
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