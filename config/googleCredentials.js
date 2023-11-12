const fs = require('fs');
const path = require('path');

let credentials = {
    is_load: false,
    client_id: '',
    project_id: '',
    auth_uri: '',
    token_uri: '',
    auth_provider_x509_cert_url: '',
    client_secret: '',
    redirect_uris: []
};

const credentialsPath = path.join(__dirname, '../credentials.json');
if (fs.existsSync(credentialsPath)) {
    const loadedCredentials = require(credentialsPath).web;
    credentials = {
        ...credentials,
        ...loadedCredentials
    };
    credentials.is_load = true;
}

module.exports = credentials;