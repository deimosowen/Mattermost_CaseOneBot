const express = require('express');
const oauthController = require('./oauthController');

const initializeServer = () => {
    const app = express();
    app.use('/', oauthController);

    app.listen(process.env.PORT, () => {
        console.log(`Server started on port ${process.env.PORT}`);
    });
}

module.exports = {
    initializeServer
};