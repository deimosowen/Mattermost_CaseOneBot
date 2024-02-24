const tasksRoutes = require('./tasks');

const setupRoutes = (app) => {
    app.use('/tasks', tasksRoutes);
};

module.exports = setupRoutes;