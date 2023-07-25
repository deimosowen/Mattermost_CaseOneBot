const { google } = require('googleapis');
const { client_id, client_secret, redirect_uris } = require('../credentials.json').web;

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

module.exports = {
    oAuth2Client
};
