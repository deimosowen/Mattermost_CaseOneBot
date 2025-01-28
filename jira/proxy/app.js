require('dotenv').config();
const express = require('express');
const authMiddleware = require('./middleware/authMiddleware');
const tasksRoutes = require('./routes/tasks');
const proxyRoutes = require('./routes/proxy');

const app = express();
app.use(express.json());

app.use('/tasks', authMiddleware, tasksRoutes);
app.use('/proxy', proxyRoutes);

module.exports = app;