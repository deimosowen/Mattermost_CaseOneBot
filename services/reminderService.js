const { postMessage } = require('../mattermost/utils');
const { sendMessage, isApiKeyExist } = require('../chatgpt');
const openAiHelpers = require('../chatgpt/helpers');
const mattermostHelpers = require('../mattermost/fileHelper');
const logger = require('../logger');
const dayOffAPI = require('isdayoff')();

class ReminderService {
    async shouldSend(useWorkingDays) {
        if (!useWorkingDays) return true;
        try {
            const isHoliday = await dayOffAPI.today();
            return !isHoliday;
        } catch (error) {
            logger.error(`isdayoff error: ${error.message}`);
            return true;
        }
    }

    async sendReminder(reminder) {
        let channel_id = reminder.channel_id;
        let message = reminder.message;
        let file_id;

        const post = async () => {
            try {
                await postMessage(channel_id, message, null, [file_id]);
            } catch (error) {
                logger.error(`postMessage failed: ${error.message}`);
            }
        };

        try {
            if (reminder.use_open_ai && isApiKeyExist) {
                const messageFromAI = await sendMessage(reminder.prompt, null, null, false);
                let messageFromAIText = messageFromAI.text;

                if (reminder.is_generate_image) {
                    const generateImage = await openAiHelpers.generateImages({
                        prompt: reminder.generate_image_prompt,
                    });
                    const file = await mattermostHelpers.uploadFileBase64(generateImage.b64_json, channel_id);
                    if (file?.file_infos?.[0]?.id) {
                        file_id = file.file_infos[0].id;
                    }
                }

                if (messageFromAIText.startsWith('"') && messageFromAIText.endsWith('"')) {
                    messageFromAIText = messageFromAIText.slice(1, -1);
                }

                message = reminder.template
                    ? reminder.template.replace('{messageFromAI}', messageFromAIText)
                    : messageFromAIText;
            }
        } catch (error) {
            logger.error(`Reminder AI branch error: ${error.message}`);
        } finally {
            await post();
        }
    }
}

module.exports = ReminderService;
