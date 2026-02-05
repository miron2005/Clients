import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MessageChannel } from "@prisma/client";
import { renderTemplate } from "./template.renderer";
import { formatEurFromCents } from "../common/utils/money";
import { utcToLocalLabel } from "../common/utils/time";
import { MockWhatsAppProvider } from "./providers/mock-whatsapp.provider";
import { TelegramProvider } from "./providers/telegram.provider";

@Injectable()
export class MessagingService {
  private readonly whatsapp = new MockWhatsAppProvider();
  private readonly telegram = new TelegramProvider();

  constructor(private readonly prisma: PrismaService) {}

  async sendBookingMessage(args: {
    tenantId: string;
    templateKey: string; // booking_confirmation / reminder_24h / reminder_2h / cancellation
    bookingId: string;
  }) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: args.bookingId, tenantId: args.tenantId },
      include: { client: true, service: true, staff: true, tenant: true }
    });
    if (!booking) return;

    // Важно: отправляем только клиентам с согласием
    if (!booking.client.consentMarketing) return;

    const vars = {
      clientName: booking.client.fullName,
      serviceName: booking.service.name,
      staffName: booking.staff.displayName,
      dateTime: utcToLocalLabel(booking.startAt, booking.tenant.timezone),
      price: formatEurFromCents(booking.priceCents)
    };

    // WhatsApp (mock)
    const waTemplate = await this.prisma.messageTemplate.findFirst({
      where: { tenantId: args.tenantId, key: args.templateKey, channel: MessageChannel.whatsapp, isActive: true }
    });
    if (waTemplate) {
      const text = renderTemplate(waTemplate.body, vars);
      await this.whatsapp.sendMessage({ toPhone: booking.client.phone, text });
    }

    // Telegram (dev: в тестовый чат, чтобы проверить доставку)
    const tgTemplate = await this.prisma.messageTemplate.findFirst({
      where: { tenantId: args.tenantId, key: args.templateKey, channel: MessageChannel.telegram, isActive: true }
    });
    if (tgTemplate) {
      const text = renderTemplate(tgTemplate.body, vars);
      await this.telegram.sendToTestChat(`(Клиент: ${booking.client.phone})\n${text}`);
    }
  }
}

