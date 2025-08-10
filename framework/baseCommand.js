const { resolveParser, Parsers, ParserId } = require('./parsers');

let defaultReplyFn = async () => { };
try {
    ({ postMessageInTreed: defaultReplyFn } = require('../mattermost/utils'));
} catch (_) { }

let defaultLogger = console;
try {
    defaultLogger = require('../logger');
} catch (_) { }

class BaseCommand {
    /**
     * @param {Object} opts
     * @param {string[]} opts.names
     * @param {string[]} [opts.aliases]
     * @param {string}   [opts.description]
     * @param {'SEMICOLON'|'FIRST_REST'|Function} [opts.parser]
     */
    constructor(opts) {
        if (!opts || !Array.isArray(opts.names) || opts.names.length === 0) {
            throw new Error('BaseCommand: "names" обязателен и должен быть непустым массивом.');
        }
        const aliases = Array.isArray(opts.aliases) ? opts.aliases : [];
        this.names = BaseCommand._normalize([...opts.names, ...aliases]);
        this.description = opts.description || '';

        this._replyFn = defaultReplyFn;
        this._logger = defaultLogger;

        const parsed = resolveParser(opts.parser);
        this._parser = parsed || Parsers[ParserId.SEMICOLON];
    }

    /** Универсальный ответ: можно передать ctx или напрямую post_id */
    async reply(idOrCtx, message) {
        let postId = null;
        if (idOrCtx && typeof idOrCtx === 'object' && 'post_id' in idOrCtx) {
            postId = idOrCtx.post_id;
        } else {
            postId = idOrCtx; // строка/UUID
        }
        if (!postId) throw new Error('BaseCommand.reply: post_id is missing');
        return this._replyFn(postId, message);
    }

    /** Опциональный парсинг: если задан parser, заполняем ctx.args из rawMessage */
    _applyParsing(ctx) {
        if (this._parser && ctx && typeof ctx.rawMessage === 'string') {
            const args = this._parser(ctx.rawMessage);
            return { ...ctx, args };
        }
        return ctx;
    }

    /** Обёртка исполнения с try/catch */
    async run(ctx) {
        const exCtx = this._applyParsing(ctx);
        try {
            await this.execute(exCtx);
        } catch (error) {
            await this.onError(exCtx, error);
        }
    }

    // Переопределяется в потомках
    // eslint-disable-next-line no-unused-vars
    async execute(_ctx) { throw new Error('Not implemented'); }

    /** НЕ переопределяйте: базовый лог + хук для доп. действий */
    async onError(ctx, error) {
        try {
            (this._logger.error || this._logger.log).call(
                this._logger,
                `${error.message}\nStack trace:\n${error.stack}`
            );
        } catch (_) { /* игнорируем ошибки логгера */ }

        try {
            await this.afterError(ctx, error); // хук-наследника (по умолчанию no-op)
        } catch (hookErr) {
            // Не даём упасть повторно из-за ошибки в afterError
            (this._logger.error || this._logger.log).call(
                this._logger,
                `afterError failed: ${hookErr.message}\nStack trace:\n${hookErr.stack}`
            );
        }
    }

    /** Переопределяйте при необходимости для дополнительных действий при ошибке */
    // eslint-disable-next-line no-unused-vars
    async afterError(_ctx, _error) { /* no-op */ }

    // Хелперы логгера (пригодятся в execute)
    logDebug(...a) { (this._logger.debug || this._logger.log).apply(this._logger, a); }
    logInfo(...a) { (this._logger.info || this._logger.log).apply(this._logger, a); }
    logWarn(...a) { (this._logger.warn || this._logger.log).apply(this._logger, a); }
    logError(...a) { (this._logger.error || this._logger.log).apply(this._logger, a); }

    static _normalize(arr) {
        return [...new Set(arr.map(s => s.trim().toLowerCase()).filter(Boolean))];
    }
}

module.exports = BaseCommand;
