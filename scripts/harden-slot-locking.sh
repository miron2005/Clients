#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# --- backend/src/common/utils/time.ts ---
cat > backend/src/common/utils/time.ts <<'FILE'
import { addMinutes, format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export function parseDateInTzToUtc(dateISO: string, tz: string): Date {
  // dateISO: YYYY-MM-DD
  return fromZonedTime(`${dateISO}T00:00:00`, tz);
}

export function utcToLocalLabel(dateUtc: Date, tz: string): string {
  const z = toZonedTime(dateUtc, tz);
  return format(z, "dd.MM.yyyy HH:mm");
}

export function utcToDateISOInTz(dateUtc: Date, tz: string): string {
  const z = toZonedTime(dateUtc, tz);
  return format(z, "yyyy-MM-dd");
}

export function addMinutesUtc(baseUtc: Date, minutes: number): Date {
  return addMinutes(baseUtc, minutes);
}

export function iso(date: Date): string {
  return date.toISOString();
}

export function weekdayIsoMon1Sun7(dayStartUtc: Date, tz: string): number {
  const z = toZonedTime(dayStartUtc, tz);
  const js = z.getDay(); // 0..6 (Sun..Sat)
  const map = [7, 1, 2, 3, 4, 5, 6];
  return map[js];
}
FILE

# --- backend/src/bookings/bookings.service.ts ---
cat > backend/src/bookings/bookings.service.ts <<'FILE'
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SlotsService } from "./slots.service";
import { addSeconds } from "date-fns";
import { BookingStatus, Role } from "@prisma/client";
import { RemindersService } from "../jobs/reminders.service";
import { utcToDateISOInTz } from "../common/utils/time";

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

  private async cleanupExpiredHolds(tenantId: string) {
    const now = new Date();
    await this.prisma.bookingHold.deleteMany({
      where: { tenantId, expiresAt: { lte: now } }
    });
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

    const now = new Date();
    await this.cleanupExpiredHolds(args.tenantId);

    // Получаем услугу и вычисляем endAt
    const service = await this.prisma.service.findFirst({
      where: { id: args.serviceId, tenantId: args.tenantId, isActive: true }
    });
    if (!service) throw new NotFoundException("Услуга не найдена.");

    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

    // Доп. защита: пересечение с существующими bookings/holds (на случай прямых вызовов API)
    const overlapBooking = await this.prisma.booking.findFirst({
      where: {
        tenantId: args.tenantId,
        staffId: args.staffId,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        status: { not: BookingStatus.cancelled }
      },
      select: { id: true }
    });
    if (overlapBooking) {
      throw new ConflictException("Выбранное время уже занято. Обновите список слотов.");
    }

    const overlapHold = await this.prisma.bookingHold.findFirst({
      where: {
        tenantId: args.tenantId,
        staffId: args.staffId,
        expiresAt: { gt: now },
        startAt: { lt: endAt },
        endAt: { gt: startAt }
      },
      select: { id: true }
    });
    if (overlapHold) {
      throw new ConflictException("Это время только что зафиксировали. Выберите другое.");
    }

    // Проверяем, что слот реально свободен (через SlotsService на локальную дату tenant’а)
    const dateLocal = utcToDateISOInTz(startAt, args.tenantTz); // YYYY-MM-DD в TZ tenant’а
    const slots = await this.slots.listSlots({
      tenantId: args.tenantId,
      tenantTz: args.tenantTz,
      serviceId: args.serviceId,
      staffId: args.staffId,
      date: dateLocal
    });

    const exists = slots.some((s) => s.startAt === startAt.toISOString());
    if (!exists) {
      throw new ConflictException("Выбранное время уже занято. Обновите список слотов.");
    }

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
      // unique constraint: tenantId + staffId + startAt
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

      // Жёсткая проверка конфликта по пересечению интервалов
      const conflict = await tx.booking.findFirst({
        where: {
          tenantId: args.tenantId,
          staffId: hold.staffId,
          startAt: { lt: hold.endAt },
          endAt: { gt: hold.startAt },
          status: { not: BookingStatus.cancelled }
        },
        select: { id: true }
      });
      if (conflict) throw new ConflictException("Это время уже занято. Выберите другое.");

      // Клиент (upsert по телефону)
      const client = await tx.client.upsert({
        where: { tenantId_phone: { tenantId: args.tenantId, phone: args.clientPhone } },
        update: {
          fullName: args.clientName,
          consentMarketing: args.consentMarketing,
          consentAt: args.consentMarketing ? now : null
        },
        create: {
          tenantId: args.tenantId,
          fullName: args.clientName,
          phone: args.clientPhone,
          consentMarketing: args.consentMarketing,
          consentAt: args.consentMarketing ? now : null
        }
      });

      // Услуга для цены
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
        include: {
          service: true,
          staff: true,
          client: true
        }
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

      // Удаляем hold + любые пересекающиеся hold'ы (иначе они будут блокировать слоты до TTL)
      await tx.bookingHold.deleteMany({
        where: {
          tenantId: args.tenantId,
          staffId: hold.staffId,
          startAt: { lt: hold.endAt },
          endAt: { gt: hold.startAt }
        }
      });

      // Планируем напоминания (только если есть согласие)
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

  // Админ: список записей в диапазоне (для календаря)
  async adminListBookings(args: {
    tenantId: string;
    from: Date;
    to: Date;
    staffId?: string;
    requesterRole: Role;
    requesterUserId: string;
  }) {
    let staffFilterId = args.staffId;

    // Если роль staff — показываем только его записи
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
      include: {
        service: true,
        staff: true,
        client: true
      },
      orderBy: [{ startAt: "asc" }]
    });
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

    // staff может менять статус только своих записей
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
FILE

echo "[OK] Backend slot locking hardened."

docker compose -f infra/docker-compose.yml restart backend
docker compose -f infra/docker-compose.yml logs --tail=120 backend
