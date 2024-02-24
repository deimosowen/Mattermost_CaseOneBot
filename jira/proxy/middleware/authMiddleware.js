const { createJiraClient } = require('../services/jiraService');

const authMiddleware = (req, res, next) => {
    const { authorization } = req.headers;
    const [username, password] = getCredentialsFromHeader(authorization);
    if (!username || !password) {
        return res.status(401).send('Необходима аутентификация');
    }
    req.jira = createJiraClient({ username, password });
    next();
};

function getCredentialsFromHeader(authorization) {
    try {
        const base64Credentials = authorization.split(' ')[1];
        return Buffer.from(base64Credentials, 'base64').toString('ascii').split(':');
    } catch (error) {
        return [];
    }
}

module.exports = authMiddleware;