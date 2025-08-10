const fs = require('fs');
const path = require('path');
const BaseCommand = require('../framework/baseCommand');

const THIS_FILE = __filename;
const INDEX_FILE = path.join(__dirname, 'index.js');

function isCommandFile(filePath) {
    if (filePath === THIS_FILE || filePath === INDEX_FILE) return false;
    const bn = path.basename(filePath);
    if (bn.startsWith('_')) return false;
    if (/\.test\.[cm]?js$/i.test(bn)) return false;
    return /\.[cm]?js$/i.test(bn);
}

function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...walk(full));
        else if (e.isFile() && isCommandFile(full)) files.push(full);
    }
    return files;
}

function loadCommands(rootDir) {
    const registry = new Map();
    const files = walk(rootDir);

    for (const file of files) {
        const mod = require(file);

        let instance = null;
        // 1) Команда экспортирует класс (наследник BaseCommand)
        if (typeof mod === 'function' && mod.prototype instanceof BaseCommand) {
            instance = new mod(); // при желании можно передать deps
        }
        // 2) Экспортирован объект { handler, names, ... } — оставляем как есть
        else if (mod && typeof mod.handler === 'function') {
            const names = Array.isArray(mod.names) && mod.names.length
                ? mod.names
                : ['!' + path.basename(file, path.extname(file))];
            for (const n of BaseCommand._normalize(names)) {
                if (registry.has(n)) {
                    const prev = registry.get(n).__file;
                    throw new Error(`Дубликат команды "${n}" в:\n - ${prev}\n - ${file}`);
                }
                registry.set(n, { handler: mod.handler, description: mod.description || '', __file: file });
            }
            continue;
        }
        // 3) Экспортирована функция-обработчик — поддержка на всякий
        else if (typeof mod === 'function') {
            const name = '!' + path.basename(file, path.extname(file));
            const n = name.toLowerCase();
            if (registry.has(n)) {
                const prev = registry.get(n).__file;
                throw new Error(`Дубликат команды "${n}" в:\n - ${prev}\n - ${file}`);
            }
            registry.set(n, { handler: mod, description: mod.description || '', __file: file });
            continue;
        }
        else {
            throw new Error(`Неизвестный экспорт команды: ${file}`);
        }

        // Регистрация экземпляра команды (кейс 1)
        const names = instance.names?.length ? instance.names : ['!' + path.basename(file, path.extname(file))];
        for (const n of BaseCommand._normalize(names)) {
            if (registry.has(n)) {
                const prev = registry.get(n).__file;
                throw new Error(`Дубликат команды "${n}" в:\n - ${prev}\n - ${file}`);
            }
            registry.set(n, {
                handler: (ctx) => instance.run(ctx),     // run сам использует ctx.rawMessage
                description: instance.description || '',
                __file: file
            });
        }
    }
    return registry;
}

const registry = loadCommands(__dirname);

module.exports = {
    get(cmd) { return cmd ? registry.get(cmd.trim().toLowerCase()) : undefined; },
    has(cmd) { return !!(cmd && registry.has(cmd.trim().toLowerCase())); },
    keys() { return Array.from(registry.keys()); }
};
