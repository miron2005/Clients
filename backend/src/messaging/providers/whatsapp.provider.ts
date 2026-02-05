export type WhatsAppSendArgs = {
  toPhone: string;
  text: string;
};

export interface WhatsAppProvider {
  sendMessage(args: WhatsAppSendArgs): Promise<void>;
}

