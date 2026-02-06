import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SlotsService } from "./slots.service";
import { addSeconds } from "date-fns";
import { BookingStatus, Role } from "@prisma/client";
import { RemindersService } from "../jobs/reminders.service";

function normalizePhone(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  // вычищаем пробелы/скобки/дефисы
  const cleaned = s.replace(/[()\s-]/g, "");
  if (cleaned.startsWith("+")) return cleaned;

  // если только цифры — попробуем привести к +7XXXXXXXXXX
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return cleaned;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
    private readonly reminders: RemindersService
  ) {}

  private holdTtlSeconds(): number {
    return Number(process.env.HOLD_TTL_SECONDS ?? 300);
  }

  async createHold(args: {
    tenantId: string;
    tenantTz: string;
    serviceId: string;
    staffId: string;
    startAtIso: string;
    clientPhone?: string;
    ip?: string;
  }) {
    const startAt = new Date(args.startAtIso);
    if (Number.isNaN(startAt.getTime())) throw new BadRequestException("Некорректный startAt.");

    const service = await this.prisma.service.findFirst({
      where: { id: args.serviceId, tenantId: args.tenantId, isActive: true }
    });
    if (!service) throw new NotFoundException("Услуга не найдена.");

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
    if (!exists) throw new ConflictException("Выбранное время уже занято. Обновите список слотов.");

    const expiresAt = addSeconds(new Date(), this.holdTtlSeconds());

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
    } catch {
      throw new ConflictException("Это время только что забронировали. Выберите другое.");
    }
  }

  async confirmBooking(args: {
    tenantId: string;
    tenantTz: string;
    holdId: string;
    clientName: string;
    clientPhone: string;
    consentMarketing: boolean;
    notes?: string;
  }) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const hold = await tx.bookingHold.findFirst({
        where: { id: args.holdId, tenantId: args.tenantId }
      });

      if (!hold) throw new NotFoundException("Hold не найден (время не зафиксировано).");
      if (hold.expiresAt.getTime() <= now.getTime()) throw new ConflictException("Hold истёк. Выберите время заново.");

      const conflict = await tx.booking.findFirst({
        where: {
          tenantId: args.tenantId,
          staffId: hold.staffId,
          startAt: hold.startAt,
          status: { not: BookingStatus.cancelled }
        }
      });
      if (conflict) throw new ConflictException("Это время уже занято. Выберите другое.");

      const phone = normalizePhone(args.clientPhone);
      if (!phone) throw new BadRequestException("Телефон клиента обязателен.");

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
      if (!service) throw new NotFoundException("Услуга не найдена.");

      const booking = await tx.booking.create({
        data: {
          tenantId: args.tenantId,
          serviceId: hold.serviceId,
          staffId: hold.staffId,
          clientId: client.id,
          startAt: hold.startAt,
          endAt: hold.endAt,
          status: BookingStatus.planned,
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
          actorRole: Role.client,
          action: "created",
          statusTo: BookingStatus.planned,
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
  async adminListBookings(args: {
    tenantId: string;
    from: Date;
    to: Date;
    staffId?: string;
    requesterRole: Role;
    requesterUserId: string;
  }) {
    let staffFilterId = args.staffId;

    if (args.requesterRole === Role.staff) {
      const sp = await this.prisma.staffProfile.findFirst({
        where: { tenantId: args.tenantId, userId: args.requesterUserId, isActive: true }
      });
      if (!sp) return [];
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
  async adminCreateBooking(args: {
    tenantId: string;
    actorUserId: string;
    actorRole: Role;
    serviceId: string;
    staffId?: string;
    startAtIso: string;
    clientName: string;
    clientPhone: string;
    consentMarketing: boolean;
    notes?: string;
    internalNote?: string;
  }) {
    const startAt = new Date(args.startAtIso);
    if (Number.isNaN(startAt.getTime())) throw new BadRequestException("Некорректный startAt.");

    const phone = normalizePhone(args.clientPhone);
    if (!phone) throw new BadRequestException("Телефон клиента обязателен.");

    const service = await this.prisma.service.findFirst({
      where: { id: args.serviceId, tenantId: args.tenantId, isActive: true }
    });
    if (!service) throw new NotFoundException("Услуга не найдена.");

    let staffId = args.staffId;

    if (args.actorRole === Role.staff) {
      // staff может создавать только себе
      const sp = await this.prisma.staffProfile.findFirst({
        where: { tenantId: args.tenantId, userId: args.actorUserId, isActive: true }
      });
      if (!sp) throw new BadRequestException("Профиль сотрудника не найден.");
      staffId = sp.id;
    } else {
      if (!staffId) throw new BadRequestException("staffId обязателен для admin/owner.");
      const sp = await this.prisma.staffProfile.findFirst({
        where: { tenantId: args.tenantId, id: staffId, isActive: true }
      });
      if (!sp) throw new BadRequestException("Мастер не найден или неактивен.");
    }

    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

    // Проверка пересечений с существующими записями
    const overlap = await this.prisma.booking.findFirst({
      where: {
        tenantId: args.tenantId,
        staffId: staffId!,
        status: { not: BookingStatus.cancelled },
        startAt: { lt: endAt },
        endAt: { gt: startAt }
      }
    });
    if (overlap) throw new ConflictException("В это время уже есть запись. Выберите другой слот.");

    // Проверка активных hold (публичная бронь)
    const now = new Date();
    const holdOverlap = await this.prisma.bookingHold.findFirst({
      where: {
        tenantId: args.tenantId,
        staffId: staffId!,
        expiresAt: { gt: now },
        startAt: { lt: endAt },
        endAt: { gt: startAt }
      }
    });
    if (holdOverlap) throw new ConflictException("Слот сейчас удерживается онлайн-записью (hold). Подождите или выберите другое время.");

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
        staffId: staffId!,
        clientId: client.id,
        startAt,
        endAt,
        status: BookingStatus.planned,
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
        statusTo: BookingStatus.planned,
        note: "Создано из админ-календаря"
      }
    });

    if (client.consentMarketing) {
      await this.reminders.scheduleForBooking(booking.id);
    }

    return { ok: true, booking };
  }

  // Админ: смена статуса
  async adminUpdateStatus(args: {
    tenantId: string;
    bookingId: string;
    status: BookingStatus;
    reason?: string;
    internalNote?: string;
    actorUserId: string;
    actorRole: Role;
  }) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: args.bookingId, tenantId: args.tenantId },
      include: { client: true, service: true, staff: true }
    });
    if (!booking) throw new NotFoundException("Запись не найдена.");

    if (args.actorRole === Role.staff) {
      const sp = await this.prisma.staffProfile.findFirst({
        where: { tenantId: args.tenantId, userId: args.actorUserId, isActive: true }
      });
      if (!sp || sp.id !== booking.staffId) {
        throw new BadRequestException("Недостаточно прав для изменения этой записи.");
      }
    }

    const updated = await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: args.status,
        cancelledReason: args.status === BookingStatus.cancelled ? (args.reason ?? "Отменено") : null,
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
}
