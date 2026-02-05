"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const template_renderer_1 = require("./template.renderer");
const money_1 = require("../common/utils/money");
const time_1 = require("../common/utils/time");
const mock_whatsapp_provider_1 = require("./providers/mock-whatsapp.provider");
const telegram_provider_1 = require("./providers/telegram.provider");
let MessagingService = class MessagingService {
    prisma;
    whatsapp = new mock_whatsapp_provider_1.MockWhatsAppProvider();
    telegram = new telegram_provider_1.TelegramProvider();
    constructor(prisma) {
        this.prisma = prisma;
    }
    async sendBookingMessage(args) {
        const booking = await this.prisma.booking.findFirst({
            where: { id: args.bookingId, tenantId: args.tenantId },
            include: { client: true, service: true, staff: true, tenant: true }
        });
        if (!booking)
            return;
        // Важно: отправляем только клиентам с согласием
        if (!booking.client.consentMarketing)
            return;
        const vars = {
            clientName: booking.client.fullName,
            serviceName: booking.service.name,
            staffName: booking.staff.displayName,
            dateTime: (0, time_1.utcToLocalLabel)(booking.startAt, booking.tenant.timezone),
            price: (0, money_1.formatEurFromCents)(booking.priceCents)
        };
        // WhatsApp (mock)
        const waTemplate = await this.prisma.messageTemplate.findFirst({
            where: { tenantId: args.tenantId, key: args.templateKey, channel: client_1.MessageChannel.whatsapp, isActive: true }
        });
        if (waTemplate) {
            const text = (0, template_renderer_1.renderTemplate)(waTemplate.body, vars);
            await this.whatsapp.sendMessage({ toPhone: booking.client.phone, text });
        }
        // Telegram (dev: в тестовый чат, чтобы проверить доставку)
        const tgTemplate = await this.prisma.messageTemplate.findFirst({
            where: { tenantId: args.tenantId, key: args.templateKey, channel: client_1.MessageChannel.telegram, isActive: true }
        });
        if (tgTemplate) {
            const text = (0, template_renderer_1.renderTemplate)(tgTemplate.body, vars);
            await this.telegram.sendToTestChat(`(Клиент: ${booking.client.phone})\n${text}`);
        }
    }
};
exports.MessagingService = MessagingService;
exports.MessagingService = MessagingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MessagingService);
//# sourceMappingURL=messaging.service.js.map