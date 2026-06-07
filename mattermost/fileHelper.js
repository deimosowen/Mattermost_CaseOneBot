const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const FormData = require('form-data');
const { client } = require('./client');
const logger = require('../logger');

async function downloadFileById(file_id) {
    try {
        const token = await client.getToken();
        const url = await client.getFileUrl(file_id);
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            headers: {
                'Authorization': `Token ${token}`
            }
        });
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        return base64;
    } catch (error) {
        logger.error(`Ошибка при скачивании файла: ${error.message}`);
    }
}

async function uploadFileBase64(base64, channel_id) {
    try {
        const filename = `${uuidv4()}.png`;
        const fileBuffer = Buffer.from(base64, 'base64');
        const file = await uploadFile(fileBuffer, filename, channel_id);
        return file;
    } catch (error) {
        logger.error(`Ошибка при загрузке файла: ${error.message}`);
        return null;
    }
}

async function uploadFile(file_buffer, file_name, channel_id, contentType = null) {
    try {
        const token = await client.getToken();
        const filesRoute = await client.getFilesRoute();
        const formData = new FormData();
        formData.append('channel_id', channel_id);
        
        // Определяем content type по расширению файла, если не указан
        if (!contentType) {
            const ext = file_name.split('.').pop().toLowerCase();
            if (ext === 'log' || ext === 'txt') {
                contentType = 'text/plain';
            } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif') {
                contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
            } else {
                contentType = 'application/octet-stream';
            }
        }
        
        formData.append('files', file_buffer, {
            filename: file_name,
            contentType: contentType
        });

        const headers = {
            ...formData.getHeaders(),
            'Authorization': `Token ${token}`
        };

        const response = await axios.post(filesRoute, formData, { headers });
        return response.data;
    } catch (error) {
        logger.error(`Ошибка при загрузке файла: ${error.message}`);
    }
}

module.exports = {
    downloadFileById,
    uploadFile,
    uploadFileBase64,
};