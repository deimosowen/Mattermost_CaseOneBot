require('dotenv').config();
const express = require('express');
const authMiddleware = require('./middleware/authMiddleware');
const tasksRoutes = require('./routes/tasks');
const proxyRoutes = require('./routes/proxy');

const app = express();
app.use(express.json());

app.get('/health', authMiddleware, async (req, res) => {
    try {
        const serverInfo = await req.jira.getServerInfo();
        res.json({
            status: 'ok',
            version: serverInfo?.version,
            baseUrl: serverInfo?.baseUrl
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.use('/tasks', authMiddleware, tasksRoutes);
app.use('/proxy', proxyRoutes);

module.exports = app;
