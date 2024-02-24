const axios = require('axios');
const { JIRA_API_URL } = require('../config');

async function getSubtasks(taskId, authHeader) {
    const url = `${JIRA_API_URL}/tasks/${taskId}/subtasks`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });
        return (response.data);
    } catch (error) {
        console.error('Ошибка при получении подзадач:', error);
    }
}

async function logTime(data, authHeader) {
    const url = `${JIRA_API_URL}/tasks/log-time`;
    try {
        const response = await axios.post(url, data, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });
        return (response.data);
    } catch (error) {
        console.error(error);
        throw new Error('Ошибка подключения к Jira');
    }
}

module.exports = {
    getSubtasks,
    logTime,
};