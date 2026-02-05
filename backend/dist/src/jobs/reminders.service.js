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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemindersService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const prisma_service_1 = require("../prisma/prisma.service");
let RemindersService = class RemindersService {
    prisma;
    queue;
    constructor(prisma, queue) {
        this.prisma = prisma;
        this.queue = queue;
    }
    async scheduleForBooking(bookingId) {
        const booking = await this.prisma.booking.findFirst({
            where: { id: bookingId },
            include: { tenant: true, client: true }
        });
        if (!booking)
            return;
        // Только если есть согласие
        if (!booking.client.consentMarketing)
            return;
        const now = Date.now();
        const start = booking.startAt.getTime();
        const offsets = [
            { key: "reminder_24h", ms: 24 * 60 * 60 * 1000 },
            { key: "reminder_2h", ms: 2 * 60 * 60 * 1000 }
        ];
        for (const o of offsets) {
            const remindAt = start - o.ms;
            const delay = remindAt - now;
            if (delay <= 0)
                continue;
            const jobId = `booking:${booking.id}:${o.key}`;
            await this.queue.add("send", {
                tenantId: booking.tenantId,
                bookingId: booking.id,
                templateKey: o.key
            }, {
                jobId,
                delay,
                attempts: 3,
                backoff: { type: "exponential", delay: 30_000 },
                removeOnComplete: true,
                removeOnFail: 50
            });
        }
    }
};
exports.RemindersService = RemindersService;
exports.RemindersService = RemindersService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bullmq_1.InjectQueue)("reminders")),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        bullmq_2.Queue])
], RemindersService);
//# sourceMappingURL=reminders.service.js.map