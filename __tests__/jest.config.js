module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
    testPathIgnorePatterns: [
        '/node_modules/',
        'conflictResolver\\.test\\.js'
    ],
    setupFilesAfterEnv: ['<rootDir>/mocks/mattermost-client.js'],
};