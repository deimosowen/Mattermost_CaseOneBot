const { postMessage } = require('../../mattermost/utils');

module.exports = async ({ channel_id }) => {
    const message = `
**Список доступных команд для пересылки сообщений:**

- \`!forward ; source_channel_id ; target_channel_id ; [additional_message] ; [thread_message] ; [thread_message_delivery_mode]\` : Добавляет новую пересылку сообщений из исходного канала в целевой. Опционально, можно добавить дополнительное сообщение, сообщение в тред исходного сообщения и режим отправки тред-сообщения: \`immediate\` или \`rules\`.
   Пример: \`!forward ; general ; support ; Обратите внимание на это сообщение ; Благодарим за обращение! ; rules\`

- \`!forward-list\` : Показывает список всех активных пересылок для текущего канала.

- \`!forward-remove ; id\` : Удаляет пересылку по указанному ID.

- \`!forward-help\` : Показывает это сообщение о помощи.

**Примечание:**
Для использования команды \`!forward\` необходимо знать точные ID каналов. Убедитесь, что вы указали верные ID каналов, чтобы избежать непредвиденных ошибок.`;

    postMessage(channel_id, message);
};
