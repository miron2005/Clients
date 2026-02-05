"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramProvider = void 0;
class TelegramProvider {
    token() {
        return process.env.TELEGRAM_BOT_TOKEN || undefined;
    }
    testChatId() {
        return process.env.TELEGRAM_TEST_CHAT_ID || undefined;
    }
    async sendToTestChat(text) {
        const token = this.token();
        const chatId = this.testChatId();
        if (!token || !chatId)
            return;
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text })
        }).catch(() => undefined);
    }
}
exports.TelegramProvider = TelegramProvider;
//# sourceMappingURL=telegram.provider.js.map