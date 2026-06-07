const axios = require('axios');
const { JIRA_API_URL } = require('../config');
const logger = require('../logger');

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
        logger.error('Ошибка при получении подзадач:', error);
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
        logger.error(error);
        throw new Error('Ошибка подключения к Jira');
    }
}

async function getTask(taskId, authHeader) {
    const url = `${JIRA_API_URL}/tasks/${taskId}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });
        return (response.data);
    } catch (error) {
        // Если задача не найдена (404), возвращаем null
        if (error.response && error.response.status === 404) {
            logger.warn(`Задача ${taskId} не найдена`);
            return null;
        }
        logger.error('Ошибка при получении задачи:', error);
        throw error;
    }
}

async function getTaskParent(taskId, authHeader) {
    const url = `${JIRA_API_URL}/tasks/${taskId}/parent`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });
        return (response.data);
    } catch (error) {
        logger.error('Ошибка при получении задачи:', error);
    }
}

async function changeStatus(taskId, status, authHeader) {
    const url = `${JIRA_API_URL}/tasks/${taskId}/status`;
    try {
        const response = await axios.put(url, { status }, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });
        return (response.data);
    } catch (error) {
        logger.error('Ошибка при изменении статуса задачи:', error);
    }
}

async function addComment(taskId, comment, authHeader) {
    const url = `${JIRA_API_URL}/tasks/${taskId}/comments`;
    try {
        const response = await axios.post(url, { comment }, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });
        return (response.data);
    } catch (error) {
        logger.error('Ошибка при добавлении комментария:', error);
    }
}

async function setReviewers(taskId, reviewers, authHeader) {
    const url = `${JIRA_API_URL}/tasks/${taskId}/reviewers`;
    try {
        const response = await axios.post(url, { reviewers }, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });
        return (response.data);
    } catch (error) {
        logger.error('Ошибка при установке ревьюверов:', error);
    }
}

async function searchTasks(jql, maxResults, authHeader) {
    const url = `${JIRA_API_URL}/tasks/search`;
    try {
        const response = await axios.get(url, {
            params: { jql, maxResults },
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        // Если ошибка поиска, логируем детали и возвращаем пустой массив
        const errorDetails = {
            message: error.message,
            response: error.response ? {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            } : null,
            jql: jql
        };
        logger.error('Ошибка при поиске задач:', JSON.stringify(errorDetails, null, 2));
        
        // Если есть детали ошибки в response.data, логируем их отдельно
        if (error.response?.data) {
            console.error('Jira API error details:', JSON.stringify(error.response.data, null, 2));
        }
        
        return [];
    }
}

module.exports = {
    getSubtasks,
    logTime,
    getTask,
    getTaskParent,
    changeStatus,
    addComment,
    setReviewers,
    searchTasks,
};