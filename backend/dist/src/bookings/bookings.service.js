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
exports.BookingsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const slots_service_1 = require("./slots.service");
const date_fns_1 = require("date-fns");
const client_1 = require("@prisma/client");
const reminders_service_1 = require("../jobs/reminders.service");
function normalizePhone(raw) {
    const s = (raw ?? "").trim();
    if (!s)
        return "";
    // вычищаем пробелы/скобки/дефисы
    const cleaned = s.replace(/[()\s-]/g, "");
    if (cleaned.startsWith("+"))
        return cleaned;
    // если только цифры — попробуем привести к +7XXXXXXXXXX
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("8"))
        return `+7${digits.slice(1)}`;
    if (digits.length === 11 && digits.startsWith("7"))
        return `+${digits}`;
    if (digits.length >= 10 && digits.length <= 15)
        return `+${digits}`;
    return cleaned;
}
let BookingsService = class BookingsService {
    prisma;
    slots;
    reminders;
    constructor(prisma, slots, reminders) {
        this.prisma = prisma;
        this.slots = slots;
        this.reminders = reminders;
    }
    holdTtlSeconds() {
        return Number(process.env.HOLD_TTL_SECONDS ?? 300);
    }
    async createHold(args) {
        const startAt = new Date(args.startAtIso);
        if (Number.isNaN(startAt.getTime()))
            throw new common_1.BadRequestException("Некорректный startAt.");
        const service = await this.prisma.service.findFirst({
            where: { id: args.serviceId, tenantId: args.tenantId, isActive: true }
        });
        if (!service)
            throw new common_1.NotFoundException("Услуга не найдена.");
        const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
        const dateLocal = args.startAtIso.slice(0, 10);
        const slots = await this.slots.listSlots({
            tenantId: args.tenantId,
            tenantTz: args.tenantTz,
            serviceId: args.serviceId,
            staffId: args.staffId,
            date: dateLocal
        });
        const exists = slots.some((s) => s.startAt === startAt.toISOString());
        if (!exists)
            throw new common_1.ConflictException("Выбранное время уже занято. Обновите список слотов.");
        const expiresAt = (0, date_fns_1.addSeconds)(new Date(), this.holdTtlSeconds());
        try {
            const hold = await this.prisma.bookingHold.create({
                data: {
                    tenantId: args.tenantId,
                    serviceId: args.serviceId,
                    staffId: args.staffId,
                    startAt,
                    endAt,
                    expiresAt,
                    clientPhone: args.clientPhone,
                    ip: args.ip
                }
            });
            return { holdId: hold.id, expiresAt: hold.expiresAt.toISOString() };
        }
        catch {
            throw new common_1.ConflictException("Это время только что забронировали. Выберите другое.");
        }
    }
    async confirmBooking(args) {
        const now = new Date();
        return this.prisma.$transaction(async (tx) => {
            const hold = await tx.bookingHold.findFirst({
                where: { id: args.holdId, tenantId: args.tenantId }
            });
            if (!hold)
                throw new common_1.NotFoundException("Hold не найден (время не зафиксировано).");
            if (hold.expiresAt.getTime() <= now.getTime())
                throw new common_1.ConflictException("Hold истёк. Выберите время заново.");
            const conflict = await tx.booking.findFirst({
                where: {
                    tenantId: args.tenantId,
                    staffId: hold.staffId,
                    startAt: hold.startAt,
                    status: { not: client_1.BookingStatus.cancelled }
                }
            });
            if (conflict)
                throw new common_1.ConflictException("Это время уже занято. Выберите другое.");
            const phone = normalizePhone(args.clientPhone);
            if (!phone)
                throw new common_1.BadRequestException("Телефон клиента обязателен.");
            const client = await tx.client.upsert({
                where: { tenantId_phone: { tenantId: args.tenantId, phone } },
                update: {
                    fullName: args.clientName,
                    consentMarketing: args.consentMarketing,
                    consentAt: args.consentMarketing ? now : null
                },
                create: {
                    tenantId: args.tenantId,
                    fullName: args.clientName,
                    phone,
                    consentMarketing: args.consentMarketing,
                    consentAt: args.consentMarketing ? now : null
                }
            });
            const service = await tx.service.findFirst({
                where: { id: hold.serviceId, tenantId: args.tenantId }
            });
            if (!service)
                throw new common_1.NotFoundException("Услуга не найдена.");
            const booking = await tx.booking.create({
                data: {
                    tenantId: args.tenantId,
                    serviceId: hold.serviceId,
                    staffId: hold.staffId,
                    clientId: client.id,
                    startAt: hold.startAt,
                    endAt: hold.endAt,
                    status: client_1.BookingStatus.planned,
                    priceCents: service.priceCents,
                    currency: service.currency,
                    notes: args.notes
                },
                include: { service: true, staff: true, client: true }
            });
            await tx.bookingHistory.create({
                data: {
                    tenantId: args.tenantId,
                    bookingId: booking.id,
                    actorRole: client_1.Role.client,
                    action: "created",
                    statusTo: client_1.BookingStatus.planned,
                    note: "Создано через онлайн-запись"
                }
            });
            await tx.bookingHold.delete({ where: { id: hold.id } });
            if (client.consentMarketing) {
                await this.reminders.scheduleForBooking(booking.id);
            }
            return {
                booking: {
                    id: booking.id,
                    status: booking.status,
                    startAt: booking.startAt.toISOString(),
                    endAt: booking.endAt.toISOString(),
                    serviceName: booking.service.name,
                    staffName: booking.staff.displayName,
                    clientName: booking.client.fullName,
                    priceCents: booking.priceCents,
                    currency: booking.currency
                }
            };
        });
    }
    // Админ: список записей в диапазоне
    async adminListBookings(args) {
        let staffFilterId = args.staffId;
        if (args.requesterRole === client_1.Role.staff) {
            const sp = await this.prisma.staffProfile.findFirst({
                where: { tenantId: args.tenantId, userId: args.requesterUserId, isActive: true }
            });
            if (!sp)
                return [];
            staffFilterId = sp.id;
        }
        return this.prisma.booking.findMany({
            where: {
                tenantId: args.tenantId,
                startAt: { gte: args.from, lt: args.to },
                ...(staffFilterId ? { staffId: staffFilterId } : {})
            },
            include: { service: true, staff: true, client: true },
            orderBy: [{ startAt: "asc" }]
        });
    }
    // Админ: создание записи вручную (из календаря)
    async adminCreateBooking(args) {
        const startAt = new Date(args.startAtIso);
        if (Number.isNaN(startAt.getTime()))
            throw new common_1.BadRequestException("Некорректный startAt.");
        const phone = normalizePhone(args.clientPhone);
        if (!phone)
            throw new common_1.BadRequestException("Телефон клиента обязателен.");
        const service = await this.prisma.service.findFirst({
            where: { id: args.serviceId, tenantId: args.tenantId, isActive: true }
        });
        if (!service)
            throw new common_1.NotFoundException("Услуга не найдена.");
        let staffId = args.staffId;
        if (args.actorRole === client_1.Role.staff) {
            // staff может создавать только себе
            const sp = await this.prisma.staffProfile.findFirst({
                where: { tenantId: args.tenantId, userId: args.actorUserId, isActive: true }
            });
            if (!sp)
                throw new common_1.BadRequestException("Профиль сотрудника не найден.");
            staffId = sp.id;
        }
        else {
            if (!staffId)
                throw new common_1.BadRequestException("staffId обязателен для admin/owner.");
            const sp = await this.prisma.staffProfile.findFirst({
                where: { tenantId: args.tenantId, id: staffId, isActive: true }
            });
            if (!sp)
                throw new common_1.BadRequestException("Мастер не найден или неактивен.");
        }
        const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
        // Проверка пересечений с существующими записями
        const overlap = await this.prisma.booking.findFirst({
            where: {
                tenantId: args.tenantId,
                staffId: staffId,
                status: { not: client_1.BookingStatus.cancelled },
                startAt: { lt: endAt },
                endAt: { gt: startAt }
            }
        });
        if (overlap)
            throw new common_1.ConflictException("В это время уже есть запись. Выберите другой слот.");
        // Проверка активных hold (публичная бронь)
        const now = new Date();
        const holdOverlap = await this.prisma.bookingHold.findFirst({
            where: {
                tenantId: args.tenantId,
                staffId: staffId,
                expiresAt: { gt: now },
                startAt: { lt: endAt },
                endAt: { gt: startAt }
            }
        });
        if (holdOverlap)
            throw new common_1.ConflictException("Слот сейчас удерживается онлайн-записью (hold). Подождите или выберите другое время.");
        // Клиент
        const client = await this.prisma.client.upsert({
            where: { tenantId_phone: { tenantId: args.tenantId, phone } },
            update: {
                fullName: args.clientName,
                consentMarketing: args.consentMarketing,
                consentAt: args.consentMarketing ? now : null
            },
            create: {
                tenantId: args.tenantId,
                fullName: args.clientName,
                phone,
                consentMarketing: args.consentMarketing,
                consentAt: args.consentMarketing ? now : null
            }
        });
        const booking = await this.prisma.booking.create({
            data: {
                tenantId: args.tenantId,
                serviceId: service.id,
                staffId: staffId,
                clientId: client.id,
                startAt,
                endAt,
                status: client_1.BookingStatus.planned,
                priceCents: service.priceCents,
                currency: service.currency,
                notes: args.notes,
                internalNote: args.internalNote,
                createdByUserId: args.actorUserId
            },
            include: { service: true, staff: true, client: true }
        });
        await this.prisma.bookingHistory.create({
            data: {
                tenantId: args.tenantId,
                bookingId: booking.id,
                changedByUserId: args.actorUserId,
                actorRole: args.actorRole,
                action: "created_admin",
                statusTo: client_1.BookingStatus.planned,
                note: "Создано из админ-календаря"
            }
        });
        if (client.consentMarketing) {
            await this.reminders.scheduleForBooking(booking.id);
        }
        return { ok: true, booking };
    }
    // Админ: смена статуса
    async adminUpdateStatus(args) {
        const booking = await this.prisma.booking.findFirst({
            where: { id: args.bookingId, tenantId: args.tenantId },
            include: { client: true, service: true, staff: true }
        });
        if (!booking)
            throw new common_1.NotFoundException("Запись не найдена.");
        if (args.actorRole === client_1.Role.staff) {
            const sp = await this.prisma.staffProfile.findFirst({
                where: { tenantId: args.tenantId, userId: args.actorUserId, isActive: true }
            });
            if (!sp || sp.id !== booking.staffId) {
                throw new common_1.BadRequestException("Недостаточно прав для изменения этой записи.");
            }
        }
        const updated = await this.prisma.booking.update({
            where: { id: booking.id },
            data: {
                status: args.status,
                cancelledReason: args.status === client_1.BookingStatus.cancelled ? (args.reason ?? "Отменено") : null,
                internalNote: args.internalNote ?? booking.internalNote
            }
        });
        await this.prisma.bookingHistory.create({
            data: {
                tenantId: args.tenantId,
                bookingId: booking.id,
                changedByUserId: args.actorUserId,
                actorRole: args.actorRole,
                action: "status_changed",
                statusFrom: booking.status,
                statusTo: args.status,
                note: args.reason
            }
        });
        return { ok: true, booking: { id: updated.id, status: updated.status } };
    }
};
exports.BookingsService = BookingsService;
exports.BookingsService = BookingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        slots_service_1.SlotsService,
        reminders_service_1.RemindersService])
], BookingsService);
//# sourceMappingURL=bookings.service.js.map