module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/'
    ],
    setupFilesAfterEnv: ['<rootDir>/mocks/mattermost-client.js'],
};