const axios = require('axios');
const { JIRA_API_URL } = require('../config');

/**
 * Отправляет запрос через прокси-сервер.
 * 
 * @param {string} url - URL конечного ресурса.
 * @param {string} method - HTTP метод (GET, POST, PUT, DELETE и т.д.).
 * @param {Object} headers - Заголовки запроса.
 * @param {Object} params - Параметры запроса.
 * @param {Object} data - Тело запроса для методов POST/PUT.
 * @returns {Promise<Object>} - Ответ от конечного ресурса.
 */
const sendProxyRequest = async ({ url, method = 'GET', headers = {}, params = {}, data = {} }) => {
    try {
        const response = await axios.post(`${JIRA_API_URL}/proxy`, {
            url,
            method,
            headers,
            params,
            data,
        });

        return response.data;
    } catch (error) {
        handleProxyError(error);
    }
};

/**
 * Обработка ошибок при запросе.
 * 
 * @param {Error} error - Ошибка, возникшая при запросе.
 */
const handleProxyError = (error) => {
    if (error.response) {
        // Сервер вернул ответ с ошибкой
        console.error(`Proxy Error: ${error.response.status} - ${error.response.data}`);
        throw new Error(`Ошибка прокси-запроса: ${error.response.status} - ${error.response.data}`);
    } else if (error.request) {
        // Запрос был отправлен, но ответа не получено
        console.error(`Proxy Error: No response received. Request: ${error.request}`);
        throw new Error('Ошибка прокси-запроса: отсутствует ответ от сервера');
    } else {
        // Ошибка на уровне настройки запроса
        console.error(`Proxy Error: ${error.message}`);
        throw new Error(`Ошибка прокси-запроса: ${error.message}`);
    }
};

module.exports = {
    sendProxyRequest,
};
