const { parseCommand } = require('../../commands/parser');

describe('parseCommand function', () => {
    it('correctly parses standard command', () => {
        const command = 'action1; action2; action3';
        const expectedOutput = ['action1', 'action2', 'action3'];
        const result = parseCommand(command);
        expect(result).toEqual(expectedOutput);
    });

    it('correctly parses meet command with multiple users and specified duration', () => {
        const command = '!meet Test Meeting @user1 @user2 @user3 30m';
        const expectedOutput = ['!meet', '@user1, @user2, @user3', 'Test Meeting', '30m'];
        const result = parseCommand(command);
        expect(result).toEqual(expectedOutput);
    });

    it('correctly parses meet command with users first and meeting name last', () => {
        const command = '!meet @user1 @user2 @user3 Test Meeting 15m';
        const expectedOutput = ['!meet', '@user1, @user2, @user3', 'Test Meeting', '15m'];
        const result = parseCommand(command);
        expect(result).toEqual(expectedOutput);
    });

    it('uses default duration when not specified in meet command', () => {
        const command = '!meet @user1 @user2 Test Meeting';
        const expectedOutput = ['!meet', '@user1, @user2', 'Test Meeting', '15m'];
        const result = parseCommand(command);
        expect(result).toEqual(expectedOutput);
    });
});