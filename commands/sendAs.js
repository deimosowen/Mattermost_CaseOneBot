const { getPost, getChannelById, postMessage, postMessageInTreed, downloadFile, uploadFile } = require('../mattermost/utils');
const { ADMIN_ID } = require('../config');
const logger = require('../logger');

module.exports = async ({ user_id, file_ids, args }) => {
    try {
        const [id, message] = args;
        let reupload_file_ids = [];
        let isTreed = false;
        let channelId = id;

        if (ADMIN_ID && (ADMIN_ID !== user_id)) {
            return;
        }

        const channel = await getChannelById(id);
        if (!channel) {
            const post = await getPost(id);
            isTreed = true;
            channelId = post.channel_id;
        }

        if (file_ids && file_ids.length > 0) {
            for (const file_id of file_ids) {
                const file = await downloadFile(file_id);
                const fileBuffer = Buffer.from(file, 'base64');
                const fileName = `${file_id}.png`;
                const result = await uploadFile(fileBuffer, fileName, channelId);
                reupload_file_ids.push(result.file_infos[0].id);
            }
        }

        if (isTreed) {
            postMessageInTreed(id, message, reupload_file_ids);
        } else {
            postMessage(id, message, null, reupload_file_ids);
        }
    } catch (error) {
        logger.error(`${error.message}\nStack trace:\n${error.stack}`);
    }
}