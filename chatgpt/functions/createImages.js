const { v4: uuidv4 } = require('uuid');
const openAiHelpers = require('../helpers');
const mattermostHelpers = require('../../mattermost/fileHelper');

const createImages = async ({ channel_id, prompt }) => {
    try {
        return { data: 'Генерация временно недоступна' };

        const result = await openAiHelpers.generateImages({ prompt });
        const filename = `${uuidv4()}.png`;
        const fileBuffer = Buffer.from(result.b64_json, 'base64');
        const file = await mattermostHelpers.uploadFile(fileBuffer, filename, channel_id);
        return {
            data: result.revised_prompt,
            fileId: file.file_infos[0].id,
        };
    } catch (error) {
        return {
            data: `При генерации изображения произошла ошибка`
        }
    }
}

module.exports = {
    name: 'createImages',
    description: 'Создание картинки из текста',
    parameters: {
        type: 'object',
        properties: {
            channel_id: { type: 'string' },
            prompt: { type: 'string', description: 'Текст, который будет использован для генерации картинки' },
        },
    },
    function: createImages,
};