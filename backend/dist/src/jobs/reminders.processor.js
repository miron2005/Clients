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
exports.RemindersProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const prisma_service_1 = require("../prisma/prisma.service");
const messaging_service_1 = require("../messaging/messaging.service");
const client_1 = require("@prisma/client");
let RemindersProcessor = class RemindersProcessor extends bullmq_1.WorkerHost {
    prisma;
    messaging;
    constructor(prisma, messaging) {
        super();
        this.prisma = prisma;
        this.messaging = messaging;
    }
    async process(job) {
        const { tenantId, bookingId, templateKey } = job.data;
        const booking = await this.prisma.booking.findFirst({
            where: { id: bookingId, tenantId },
            include: { client: true }
        });
        if (!booking)
            return;
        if (booking.status !== client_1.BookingStatus.planned)
            return;
        if (!booking.client.consentMarketing)
            return;
        await this.messaging.sendBookingMessage({
            tenantId,
            bookingId,
            templateKey
        });
        await this.prisma.bookingHistory.create({
            data: {
                tenantId,
                bookingId,
                action: "reminder_sent",
                note: `Отправлено напоминание: ${templateKey}`,
                meta: { templateKey }
            }
        });
    }
    onFailed(job, err) {
        // eslint-disable-next-line no-console
        console.error("[reminders] job failed:", job?.id, err?.message);
    }
};
exports.RemindersProcessor = RemindersProcessor;
__decorate([
    (0, bullmq_1.OnWorkerEvent)("failed"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_2.Job, Error]),
    __metadata("design:returntype", void 0)
], RemindersProcessor.prototype, "onFailed", null);
exports.RemindersProcessor = RemindersProcessor = __decorate([
    (0, bullmq_1.Processor)("reminders"),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        messaging_service_1.MessagingService])
], RemindersProcessor);
//# sourceMappingURL=reminders.processor.js.map