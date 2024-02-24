require('dotenv').config();
const express = require('express');
const authMiddleware = require('./middleware/authMiddleware');
const setupRoutes = require('./routes');

const app = express();
app.use(express.json());
app.use(authMiddleware);

setupRoutes(app);

module.exports = app;