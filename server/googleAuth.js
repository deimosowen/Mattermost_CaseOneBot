const { google } = require('googleapis');
const { is_load, client_id, client_secret, redirect_uris } = require('../config/googleCredentials');

const isLoad = is_load;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

module.exports = {
    isLoad,
    oAuth2Client,
};
