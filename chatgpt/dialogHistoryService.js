const cacheService = require('../services/cacheService');

class DialogHistoryService {
    constructor(dialogId) {
        this.dialogId = dialogId;
        if (!cacheService.has(this.dialogId)) {
            cacheService.set(this.dialogId, []);
        }
    }

    getHistory() {
        return cacheService.get(this.dialogId) || [];
    }

    addMessage(message) {
        const history = this.getHistory();
        history.push(message);
        cacheService.set(this.dialogId, history);
        return history;
    }

    getCurrentDialogId() {
        return this.dialogId;
    }
}

// Фабричный метод для создания сервиса
module.exports = {
    createService: (dialogId) => new DialogHistoryService(dialogId)
};