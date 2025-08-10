const BaseCommand = require('../framework/baseCommand');
const { ParserId } = require('../framework/parsers');

class InviteCommand extends BaseCommand {
    constructor() {
        super(
            {
                names: ['!test'],
                aliases: ['!ts'],
                description: 'TEST',
                parser: ParserId.FIRST_REST
            }
        );
    }

    async execute(ctx) {
        await this.reply(ctx, 'test');
    }

    async afterError(ctx, _error) {
        await this.reply(ctx, `${ctx.user_name} Канал не найден.`);
    }
}

module.exports = InviteCommand;