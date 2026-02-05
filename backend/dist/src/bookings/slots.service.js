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
exports.SlotsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const date_fns_1 = require("date-fns");
const time_1 = require("../common/utils/time");
const client_1 = require("@prisma/client");
let SlotsService = class SlotsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    stepMinutes() {
        return Number(process.env.SLOT_STEP_MINUTES ?? 15);
    }
    async listSlots(args) {
        const service = await this.prisma.service.findFirst({
            where: { id: args.serviceId, tenantId: args.tenantId, isActive: true }
        });
        if (!service)
            return [];
        const staff = await this.prisma.staffProfile.findFirst({
            where: { id: args.staffId, tenantId: args.tenantId, isActive: true }
        });
        if (!staff)
            return [];
        const dayStartUtc = (0, time_1.parseDateInTzToUtc)(args.date, args.tenantTz);
        const dayEndUtc = (0, date_fns_1.addMinutes)(dayStartUtc, 24 * 60);
        const weekday = (0, time_1.weekdayIsoMon1Sun7)(dayStartUtc, args.tenantTz);
        const rule = await this.prisma.availabilityRule.findFirst({
            where: { tenantId: args.tenantId, staffId: args.staffId, weekday }
        });
        if (!rule)
            return [];
        const now = new Date();
        const bookings = await this.prisma.booking.findMany({
            where: {
                tenantId: args.tenantId,
                staffId: args.staffId,
                startAt: { lt: dayEndUtc },
                endAt: { gt: dayStartUtc },
                status: { not: client_1.BookingStatus.cancelled }
            },
            select: { startAt: true, endAt: true }
        });
        const holds = await this.prisma.bookingHold.findMany({
            where: {
                tenantId: args.tenantId,
                staffId: args.staffId,
                startAt: { lt: dayEndUtc },
                endAt: { gt: dayStartUtc },
                expiresAt: { gt: now }
            },
            select: { startAt: true, endAt: true }
        });
        const duration = service.durationMinutes;
        const step = this.stepMinutes();
        const slots = [];
        for (let m = rule.startMinute; m + duration <= rule.endMinute; m += step) {
            // Обеденный перерыв
            if (rule.breakStartMinute != null &&
                rule.breakEndMinute != null) {
                const slotEndMin = m + duration;
                const overlapBreak = m < rule.breakEndMinute && slotEndMin > rule.breakStartMinute;
                if (overlapBreak)
                    continue;
            }
            const startAtUtc = (0, time_1.addMinutesUtc)(dayStartUtc, m);
            const endAtUtc = (0, date_fns_1.addMinutes)(startAtUtc, duration);
            // Только будущие слоты
            if (startAtUtc.getTime() <= now.getTime())
                continue;
            const overlapsAny = (arr) => arr.some((x) => x.startAt < endAtUtc && x.endAt > startAtUtc);
            if (overlapsAny(bookings) || overlapsAny(holds))
                continue;
            slots.push({ startAt: (0, time_1.iso)(startAtUtc), endAt: (0, time_1.iso)(endAtUtc) });
        }
        return slots;
    }
};
exports.SlotsService = SlotsService;
exports.SlotsService = SlotsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SlotsService);
//# sourceMappingURL=slots.service.js.map