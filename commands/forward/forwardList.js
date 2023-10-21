const { getAllChannelMappings } = require('../../db/models/forward');
const { postMessage } = require('../../mattermost/utils');
const resources = require('../../resources.json').forward;

module.exports = async ({ channel_id }) => {
    const forwards = await getAllChannelMappings();

    if (forwards.length === 0) {
        postMessage(channel_id, resources.noActiveForwards);
        return;
    }

    let message = resources.forwardListHeader;

    forwards.forEach((forward, i) => {
        message += `- ID: \`${forward.id}\`, Исходный канал: \`${forward.source_channel_id}\`, Целевой канал: \`${forward.target_channel_id}\`, ${forward.message ? `Доп. сообщение: \`${forward.message}\`` : 'Без доп. сообщения'}, Тред-сообщение: \`${forward.thread_message || 'Отсутствует'}\`\n`;
    });

    postMessage(channel_id, message);
};