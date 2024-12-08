const axios = require('axios');
const logger = require('../logger');
const { ABSENCE_BASE_URL, ABSENCE_API_TOKEN } = require('../config');

// Функция для проверки доступности сотрудников по датам
async function checkEmployeeAvailability(employeeRequests) {
    try {
        const response = await axios.post(
            `${ABSENCE_BASE_URL}/absence/employees-availability`,
            employeeRequests,
            {
                headers: {
                    'Authorization': `Bearer ${ABSENCE_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        logger.error(`Ошибка при выполнении запроса: ${error.message}`);
    }
}

// Функция для проверки доступности сотрудников на указанные даты
async function checkEmployeeAvailabilityByDate(requestData) {
    try {
        const response = await axios.post(
            `${ABSENCE_BASE_URL}/absence/employees-availability-by-date`,
            requestData,
            {
                headers: {
                    'Authorization': `Bearer ${ABSENCE_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        logger.error(`Ошибка при выполнении запроса: ${error.message}`);
    }
}

module.exports = {
    checkEmployeeAvailability,
    checkEmployeeAvailabilityByDate
}