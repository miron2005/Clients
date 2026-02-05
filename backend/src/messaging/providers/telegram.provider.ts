export class TelegramProvider {
  private token(): string | undefined {
    return process.env.TELEGRAM_BOT_TOKEN || undefined;
  }

  private testChatId(): string | undefined {
    return process.env.TELEGRAM_TEST_CHAT_ID || undefined;
  }

  async sendToTestChat(text: string): Promise<void> {
    const token = this.token();
    const chatId = this.testChatId();
    if (!token || !chatId) return;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    }).catch(() => undefined);
  }
}

