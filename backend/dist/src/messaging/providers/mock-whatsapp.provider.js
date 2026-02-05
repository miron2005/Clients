"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockWhatsAppProvider = void 0;
class MockWhatsAppProvider {
    async sendMessage(args) {
        // В dev просто логируем, в проде подключится реальный провайдер
        // eslint-disable-next-line no-console
        console.log(`[MockWhatsApp] -> ${args.toPhone}: ${args.text}`);
    }
}
exports.MockWhatsAppProvider = MockWhatsAppProvider;
//# sourceMappingURL=mock-whatsapp.provider.js.map