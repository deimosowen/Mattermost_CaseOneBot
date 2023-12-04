const express = require('express');
const path = require('path');
const oauthController = require('./controllers/oauthController');
const calendarController = require('./controllers/calendarController');
const dutyController = require('./controllers/dutyController');

const initializeServer = () => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.engine('ejs', require('ejs-locals'));
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '/views'));
    app.use(express.static('public'));

    app.use('/', oauthController);
    app.use('/calendar', calendarController);
    app.use('/duty', dutyController);

    app.listen(process.env.PORT, () => {
        console.log(`Server started on port ${process.env.PORT}`);
    });
}

module.exports = {
    initializeServer
};