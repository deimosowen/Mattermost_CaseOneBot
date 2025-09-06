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
        logger.error('Ошибка при получении задачи:', error);
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

module.exports = {
    getSubtasks,
    logTime,
    getTask,
    getTaskParent,
    changeStatus,
    addComment,
    setReviewers,
};