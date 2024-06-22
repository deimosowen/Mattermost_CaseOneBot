const { google } = require('googleapis');
const { is_load, client_id, client_secret, redirect_uris } = require('../config/googleCredentials');
const { getUser } = require('../db/models/calendars');

const isLoad = is_load;
const oAuth2ClientMap = new Map();

function createOAuth2Client() {
    return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

async function getOAuth2ClientForUser(user_id) {
    let userOAuth2Client = oAuth2ClientMap.get(user_id);
    if (!userOAuth2Client) {
        const user = await getUser(user_id);
        userOAuth2Client = createOAuth2Client();
        userOAuth2Client.setCredentials(user);
        oAuth2ClientMap.set(user_id, userOAuth2Client);
    }
    return userOAuth2Client;
}

module.exports = {
    isLoad,
    createOAuth2Client,
    getOAuth2ClientForUser,
};
