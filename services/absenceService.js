const proxyService = require('./proxyService');
const logger = require('../logger');
const { ABSENCE_BASE_URL, ABSENCE_API_TOKEN } = require('../config');

class AbsenceService {
    constructor() {
        this.baseUrl = ABSENCE_BASE_URL;
        this.apiToken = ABSENCE_API_TOKEN;
    }

    /**
     * Унифицированный метод для отправки запросов через прокси.
     * @param {string} endpoint - Конечная точка API (например, '/absence/employees-availability').
     * @param {string} method - HTTP метод (GET, POST, PUT и т.д.).
     * @param {Object} data - Тело запроса (для POST/PUT).
     * @param {Object} params - Параметры запроса (для GET).
     * @returns {Promise<Object>} - Ответ API.
     */
    async _proxyRequest(endpoint, method = 'GET', data = {}, params = {}) {
        try {
            const response = await proxyService.sendProxyRequest({
                url: `${this.baseUrl}${endpoint}`,
                method,
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                },
                data,
                params,
            });
            return response;
        } catch (error) {
            logger.error(`Ошибка при запросе к ${endpoint}: ${error.message}`);
        }
    }

    /**
     * Проверка доступности сотрудников по датам.
     * @param {Object} employeeRequests - Данные для проверки.
     * @returns {Promise<Object>} - Ответ API.
     */
    async checkEmployeeAvailability(employeeRequests) {
        return this._proxyRequest('/absence/employees-availability', 'POST', employeeRequests);
    }

    /**
     * Проверка доступности сотрудников на указанные даты.
     * @param {Object} requestData - Данные для проверки.
     * @returns {Promise<Object>} - Ответ API.
     */
    async checkEmployeeAvailabilityByDate(requestData) {
        return this._proxyRequest('/absence/employees-availability-by-date', 'POST', requestData);
    }
}

module.exports = new AbsenceService();