import { WhatsAppProvider, WhatsAppSendArgs } from "./whatsapp.provider";

export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(args: WhatsAppSendArgs): Promise<void> {
    // В dev просто логируем, в проде подключится реальный провайдер
    // eslint-disable-next-line no-console
    console.log(`[MockWhatsApp] -> ${args.toPhone}: ${args.text}`);
  }
}

