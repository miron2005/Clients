#!/usr/bin/env bash
set -euo pipefail

# Запускать из корня репозитория (где Makefile)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# -------------------------
# Backend: utils/time.ts (добавляем utcToDateISOInTz)
# -------------------------
mkdir -p backend/src/common/utils

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

# -------------------------
# Backend: utils/phone.ts (нормализация телефона под +7 + общий E.164)
# -------------------------
cat > backend/src/common/utils/phone.ts <<'FILE'
export function normalizePhoneE164(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) throw new Error("Телефон обязателен.");

  // Убираем пробелы/скобки/дефисы и т.п.
  const cleaned = s.replace(/[()\-\s]/g, "");

  // Если уже похоже на E.164: + + 8..15 цифр
  if (/^\+\d{8,15}$/.test(cleaned)) {
    // Частый кейс: "+7..." — ок
    return cleaned;
  }

  // Если ввели без плюса — разбираем как РФ по цифрам
  const digits = s.replace(/\D/g, "");

  // 10 цифр (обычно без кода страны) → +7
  if (digits.length === 10) {
    return `+7${digits}`;
  }

  // 11 цифр: 8XXXXXXXXXX или 7XXXXXXXXXX → +7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7${digits.slice(1)}`;
  }

  throw new Error("Телефон должен быть в формате +7XXXXXXXXXX (допустимы пробелы/скобки/дефисы).");
}

export function isRuPhoneE164(phone: string): boolean {
  return /^\+7\d{10}$/.test(phone);
}
FILE

# -------------------------
# Backend: bookings.service.ts (timezone + overlap + нормализация телефона)
# -------------------------
cat > backend/src/bookings/bookings.service.ts <<'FILE'
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SlotsService } from "./slots.service";
import { addSeconds } from "date-fns";
import { BookingStatus, Role } from "@prisma/client";
import { RemindersService } from "../jobs/reminders.service";
import { utcToDateISOInTz } from "../common/utils/time";
import { isRuPhoneE164, normalizePhoneE164 } from "../common/utils/phone";

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

  private normalizeClientPhoneOrThrow(raw: string): string {
    try {
      const p = normalizePhoneE164(raw);
      // Для твоего кейса делаем строго +7 (чтобы не плодить мусор)
      if (!isRuPhoneE164(p)) {
        throw new Error("Для РФ используйте номер +7XXXXXXXXXX.");
      }
      return p;
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? "Некорректный телефон.");
    }
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
    if (startAt.getTime() <= now.getTime()) throw new BadRequestException("Нельзя создать hold в прошлом.");

    await this.cleanupExpiredHolds(args.tenantId);

    const service = await this.prisma.service.findFirst({
      where: { id: args.serviceId, tenantId: args.tenantId, isActive: true }
    });
    if (!service) throw new NotFoundException("Услуга не найдена.");

    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

    // Нормализация телефона (если прислали)
    const clientPhone = args.clientPhone ? this.normalizeClientPhoneOrThrow(args.clientPhone) : undefined;

    // Жёсткая защита от double booking (по пересечению интервалов)
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

    // Проверяем, что слот реально свободен (через SlotsService) — ВАЖНО: дата в TZ tenant’а
    const dateLocal = utcToDateISOInTz(startAt, args.tenantTz);
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
          clientPhone,
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

    const clientName = (args.clientName ?? "").trim();
    if (clientName.length < 2) throw new BadRequestException("Имя клиента слишком короткое.");

    const phone = this.normalizeClientPhoneOrThrow(args.clientPhone);

    return this.prisma.$transaction(async (tx) => {
      const hold = await tx.bookingHold.findFirst({
        where: { id: args.holdId, tenantId: args.tenantId }
      });

      if (!hold) throw new NotFoundException("Hold не найден (время не зафиксировано).");
      if (hold.expiresAt.getTime() <= now.getTime()) throw new ConflictException("Hold истёк. Выберите время заново.");

      // Жёсткая проверка конфликта по пересечению
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

      // Клиент (upsert по нормализованному телефону)
      const client = await tx.client.upsert({
        where: { tenantId_phone: { tenantId: args.tenantId, phone } },
        update: {
          fullName: clientName,
          consentMarketing: args.consentMarketing,
          consentAt: args.consentMarketing ? now : null
        },
        create: {
          tenantId: args.tenantId,
          fullName: clientName,
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

      // Удаляем hold и любые пересекающиеся hold’ы (чтобы не блокировали слоты)
      await tx.bookingHold.deleteMany({
        where: {
          tenantId: args.tenantId,
          staffId: hold.staffId,
          startAt: { lt: hold.endAt },
          endAt: { gt: hold.startAt }
        }
      });

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
          clientPhone: booking.client.phone,
          priceCents: booking.priceCents,
          currency: booking.currency
        }
      };
    });
  }

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
FILE

# -------------------------
# Backend: seed.ts (RUB + Europe/Moscow + цены в рублях + клиенты +7)
# -------------------------
cat > backend/prisma/seed.ts <<'FILE'
import { PrismaClient, BookingStatus, LedgerType, PayrollRuleType, MessageChannel } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { addDays, setHours, setMinutes, startOfDay, subDays } from "date-fns";

const prisma = new PrismaClient();

function moneyToCents(value: number): number {
  // Для RUB это "копейки" (value в рублях).
  return Math.round(value * 100);
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

async function upsertUser(email: string, name: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, isActive: true },
    create: { email, name, passwordHash, isActive: true }
  });
}

async function main() {
  // 1) Tenant (РФ: RUB + Europe/Moscow)
  const tenant = await prisma.tenant.upsert({
    where: { slug: "lime" },
    update: { name: "Демо-салон «Лайм»", timezone: "Europe/Moscow", currency: "RUB" },
    create: { name: "Демо-салон «Лайм»", slug: "lime", timezone: "Europe/Moscow", currency: "RUB" }
  });

  // 2) Users
  const admin = await upsertUser("admin@lime.local", "Администратор", "Admin123!");
  const master1 = await upsertUser("master1@lime.local", "Мария", "Master123!");
  const master2 = await upsertUser("master2@lime.local", "Алексей", "Master123!");

  // 3) Memberships
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
    update: { role: "owner" },
    create: { tenantId: tenant.id, userId: admin.id, role: "owner" }
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: master1.id } },
    update: { role: "staff" },
    create: { tenantId: tenant.id, userId: master1.id, role: "staff" }
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: master2.id } },
    update: { role: "staff" },
    create: { tenantId: tenant.id, userId: master2.id, role: "staff" }
  });

  // 4) Staff profiles
  const staffMaria = await prisma.staffProfile.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: master1.id } },
    update: { displayName: "Мария", isActive: true },
    create: { tenantId: tenant.id, userId: master1.id, displayName: "Мария", isActive: true }
  });

  const staffAlexey = await prisma.staffProfile.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: master2.id } },
    update: { displayName: "Алексей", isActive: true },
    create: { tenantId: tenant.id, userId: master2.id, displayName: "Алексей", isActive: true }
  });

  // 5) Services (цены в RUB)
  const servicesSeed = [
    { name: "Стрижка мужская", durationMinutes: 45, price: 1500 },
    { name: "Стрижка женская", durationMinutes: 60, price: 2500 },
    { name: "Маникюр", durationMinutes: 60, price: 2000 },
    { name: "Окрашивание", durationMinutes: 120, price: 6000 }
  ];

  const services = [];
  for (const s of servicesSeed) {
    const created = await prisma.service.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: s.name } },
      update: { durationMinutes: s.durationMinutes, priceCents: moneyToCents(s.price), isActive: true, currency: "RUB" },
      create: {
        tenantId: tenant.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
        priceCents: moneyToCents(s.price),
        currency: "RUB",
        isActive: true
      }
    });
    services.push(created);
  }

  // 6) Availability rules: Mon–Fri 10:00–19:00, lunch 14:00–15:00
  const weekdays = [1, 2, 3, 4, 5];
  for (const staff of [staffMaria, staffAlexey]) {
    for (const wd of weekdays) {
      await prisma.availabilityRule.upsert({
        where: { tenantId_staffId_weekday: { tenantId: tenant.id, staffId: staff.id, weekday: wd } },
        update: {
          startMinute: timeToMinutes("10:00"),
          endMinute: timeToMinutes("19:00"),
          breakStartMinute: timeToMinutes("14:00"),
          breakEndMinute: timeToMinutes("15:00")
        },
        create: {
          tenantId: tenant.id,
          staffId: staff.id,
          weekday: wd,
          startMinute: timeToMinutes("10:00"),
          endMinute: timeToMinutes("19:00"),
          breakStartMinute: timeToMinutes("14:00"),
          breakEndMinute: timeToMinutes("15:00")
        }
      });
    }
  }

  // 7) Clients (+7, без пробелов — чтобы ключ tenantId_phone был чистый)
  const clientsSeed = [
    { fullName: "Ирина Петрова", phone: "+79000000001", consent: true },
    { fullName: "Олег Смирнов", phone: "+79000000002", consent: true },
    { fullName: "Анна Иванова", phone: "+79000000003", consent: false }
  ];

  const clients = [];
  for (const c of clientsSeed) {
    const client = await prisma.client.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone: c.phone } },
      update: { fullName: c.fullName, consentMarketing: c.consent, consentAt: c.consent ? new Date() : null },
      create: {
        tenantId: tenant.id,
        fullName: c.fullName,
        phone: c.phone,
        consentMarketing: c.consent,
        consentAt: c.consent ? new Date() : null
      }
    });
    clients.push(client);
  }

  // 8) Finance categories
  const categories = ["Услуги", "Расходники", "Аренда", "Зарплата"];
  const categoryMap: Record<string, string> = {};
  for (const name of categories) {
    const cat = await prisma.ledgerCategory.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: {},
      create: { tenantId: tenant.id, name }
    });
    categoryMap[name] = cat.id;
  }

  // 9) Demo ledger transactions (RUB)
  const now = new Date();
  await prisma.ledgerTransaction.createMany({
    data: [
      {
        tenantId: tenant.id,
        categoryId: categoryMap["Услуги"],
        type: LedgerType.income,
        amountCents: moneyToCents(12000),
        currency: "RUB",
        occurredAt: subDays(now, 3),
        description: "Выручка за день (демо)"
      },
      {
        tenantId: tenant.id,
        categoryId: categoryMap["Расходники"],
        type: LedgerType.expense,
        amountCents: moneyToCents(1850),
        currency: "RUB",
        occurredAt: subDays(now, 2),
        description: "Покупка расходников (демо)"
      },
      {
        tenantId: tenant.id,
        categoryId: categoryMap["Аренда"],
        type: LedgerType.expense,
        amountCents: moneyToCents(6000),
        currency: "RUB",
        occurredAt: subDays(now, 1),
        description: "Часть аренды (демо)"
      }
    ],
    skipDuplicates: true
  });

  // 10) Payroll rules
  await prisma.payrollRule.createMany({
    data: [
      {
        tenantId: tenant.id,
        staffId: staffMaria.id,
        ruleType: PayrollRuleType.percent,
        percentBps: 3000,
        isActive: true
      },
      {
        tenantId: tenant.id,
        staffId: staffAlexey.id,
        ruleType: PayrollRuleType.mixed,
        percentBps: 2500,
        monthlyFixedCents: moneyToCents(60000),
        isActive: true
      }
    ],
    skipDuplicates: true
  });

  // 11) Message templates (RU)
  const templates = [
    {
      key: "booking_confirmation",
      title: "Подтверждение записи",
      body:
        "Здравствуйте, {clientName}! Вы записаны на услугу «{serviceName}» {dateTime} к мастеру {staffName}. Стоимость: {price}."
    },
    {
      key: "reminder_24h",
      title: "Напоминание за 24 часа",
      body:
        "Напоминаем: завтра {dateTime} у вас запись на «{serviceName}» к мастеру {staffName}. Если планы изменились — ответьте на это сообщение."
    },
    {
      key: "reminder_2h",
      title: "Напоминание за 2 часа",
      body:
        "Скоро встречаемся! Через 2 часа ({dateTime}) запись на «{serviceName}» к мастеру {staffName}. Ждём вас 🙂"
    },
    {
      key: "cancellation",
      title: "Отмена записи",
      body:
        "Запись на «{serviceName}» {dateTime} отменена. Если хотите перенести — выберите новое время на сайте."
    }
  ];

  for (const t of templates) {
    for (const ch of [MessageChannel.telegram, MessageChannel.whatsapp]) {
      await prisma.messageTemplate.upsert({
        where: { tenantId_key_channel: { tenantId: tenant.id, key: t.key, channel: ch } },
        update: { title: t.title, body: t.body, isActive: true },
        create: {
          tenantId: tenant.id,
          key: t.key,
          channel: ch,
          title: t.title,
          body: t.body,
          isActive: true
        }
      });
    }
  }

  // 12) Demo bookings: 3 upcoming + 2 past
  const serviceMen = services.find(s => s.name === "Стрижка мужская")!;
  const serviceWomen = services.find(s => s.name === "Стрижка женская")!;
  const serviceMani = services.find(s => s.name === "Маникюр")!;
  const serviceColor = services.find(s => s.name === "Окрашивание")!;

  const today0 = startOfDay(new Date());
  const d1 = addDays(today0, 1);
  const d2 = addDays(today0, 2);
  const d3 = addDays(today0, 3);
  const past1 = subDays(today0, 5);
  const past2 = subDays(today0, 12);

  function atDay(day: Date, hh: number, mm: number) {
    return setMinutes(setHours(day, hh), mm);
  }

  await prisma.booking.deleteMany({
    where: {
      tenantId: tenant.id,
      startAt: { gte: subDays(today0, 30), lte: addDays(today0, 30) }
    }
  });

  await prisma.booking.createMany({
    data: [
      {
        tenantId: tenant.id,
        serviceId: serviceMen.id,
        staffId: staffMaria.id,
        clientId: clients[0].id,
        startAt: atDay(d1, 11, 0),
        endAt: atDay(d1, 11, 45),
        status: BookingStatus.planned,
        priceCents: serviceMen.priceCents,
        currency: "RUB",
        notes: "Демо-запись"
      },
      {
        tenantId: tenant.id,
        serviceId: serviceMani.id,
        staffId: staffAlexey.id,
        clientId: clients[1].id,
        startAt: atDay(d2, 16, 0),
        endAt: atDay(d2, 17, 0),
        status: BookingStatus.planned,
        priceCents: serviceMani.priceCents,
        currency: "RUB"
      },
      {
        tenantId: tenant.id,
        serviceId: serviceColor.id,
        staffId: staffMaria.id,
        clientId: clients[2].id,
        startAt: atDay(d3, 10, 0),
        endAt: atDay(d3, 12, 0),
        status: BookingStatus.planned,
        priceCents: serviceColor.priceCents,
        currency: "RUB"
      },
      {
        tenantId: tenant.id,
        serviceId: serviceWomen.id,
        staffId: staffAlexey.id,
        clientId: clients[0].id,
        startAt: atDay(past1, 12, 0),
        endAt: atDay(past1, 13, 0),
        status: BookingStatus.arrived,
        priceCents: serviceWomen.priceCents,
        currency: "RUB"
      },
      {
        tenantId: tenant.id,
        serviceId: serviceMen.id,
        staffId: staffMaria.id,
        clientId: clients[1].id,
        startAt: atDay(past2, 15, 0),
        endAt: atDay(past2, 15, 45),
        status: BookingStatus.no_show,
        priceCents: serviceMen.priceCents,
        currency: "RUB",
        cancelledReason: "Клиент не пришёл (демо)"
      }
    ]
  });

  console.log("✅ Seed выполнен (RUB/+7): tenant lime + пользователи + услуги + расписание + клиенты + записи + финансы + payroll + шаблоны");
}

main()
  .catch((e) => {
    console.error("❌ Ошибка seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
FILE

# -------------------------
# Frontend: публичный booking flow (₽ + +7 + нормализация/валидация)
# Создаём маршруты, если их нет.
# -------------------------
mkdir -p frontend/app/_public
mkdir -p frontend/app/[tenant]/booking
mkdir -p frontend/app/lime/booking
mkdir -p frontend/app/booking

cat > frontend/app/_public/BookingFlow.tsx <<'FILE'
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type TenantInfo = { slug: string; name?: string; timezone?: string; currency?: string };
type Service = { id: string; name: string; durationMinutes: number; priceCents: number; currency: string };
type Staff = { id: string; displayName: string };
type Slot = { startAt: string; endAt: string };

function fmtMoney(cents: number, currency?: string) {
  const cur = currency || "RUB";
  const v = cents / 100;
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: cur }).format(v);
  } catch {
    return `${v.toFixed(2).replace(".", ",")} ${cur}`;
  }
}

function toLocalTimeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeRuPhone(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // digits only
  const digits = s.replace(/\D/g, "");

  // 10 digits => +7
  if (digits.length === 10) return `+7${digits}`;

  // 11 digits: 8XXXXXXXXXX or 7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+7${digits.slice(1)}`;

  // already +7xxxxxxxxxx with formatting
  if (/^\+7\d{10}$/.test(s.replace(/[()\-\s]/g, ""))) return s.replace(/[()\-\s]/g, "");

  return null;
}

export default function BookingFlow({ tenantSlug }: { tenantSlug: string }) {
  const [tenant, setTenant] = useState<TenantInfo>({ slug: tenantSlug });

  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [serviceId, setServiceId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");

  const [date, setDate] = useState<string>(todayPlus(1));

  const [slotStartAt, setSlotStartAt] = useState<string>("");
  const [holdId, setHoldId] = useState<string>("");
  const [holdExpiresAt, setHoldExpiresAt] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);

  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<any>(null);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId]
  );

  const normalizedPhone = useMemo(() => normalizeRuPhone(clientPhone), [clientPhone]);
  const phoneOk = !!normalizedPhone;

  // 1) Услуги + инфо о tenant
  useEffect(() => {
    (async () => {
      try {
        setError("");
        const resp = await apiGet<{ tenant: TenantInfo; services: Service[] }>(`/public/${tenantSlug}/services`, {
          tenantSlug
        });
        setTenant(resp.tenant ?? { slug: tenantSlug });
        setServices(resp.services ?? []);
      } catch {
        setError("Не удалось загрузить услуги. Проверьте backend и tenant.");
      }
    })();
  }, [tenantSlug]);

  // 2) Мастера
  useEffect(() => {
    if (!serviceId) return;
    (async () => {
      try {
        setError("");
        const resp = await apiGet<{ staff: Staff[] }>(`/public/${tenantSlug}/staff?serviceId=${serviceId}`, {
          tenantSlug
        });
        setStaff(resp.staff ?? []);
      } catch {
        setError("Не удалось загрузить мастеров.");
      }
    })();
  }, [tenantSlug, serviceId]);

  // 3) Слоты
  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    (async () => {
      try {
        setError("");
        setSlots([]);
        const resp = await apiGet<{ slots: Slot[] }>(
          `/public/${tenantSlug}/slots?serviceId=${serviceId}&staffId=${staffId}&date=${date}`,
          { tenantSlug }
        );
        setSlots(resp.slots ?? []);
      } catch {
        setError("Не удалось загрузить свободное время.");
      }
    })();
  }, [tenantSlug, serviceId, staffId, date]);

  // TTL hold
  useEffect(() => {
    if (!holdExpiresAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setError("Время фиксации слота истекло. Выберите время заново.");
        setHoldId("");
        setHoldExpiresAt("");
        setSlotStartAt("");
        setStep(3);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt]);

  function resetToStep1() {
    setServiceId("");
    setStaffId("");
    setSlots([]);
    setStep(1);
    setHoldId("");
    setHoldExpiresAt("");
    setSlotStartAt("");
    setSuccess(null);
  }

  function resetAfterService() {
    setStaffId("");
    setSlots([]);
    setStep(2);
    setHoldId("");
    setHoldExpiresAt("");
    setSlotStartAt("");
    setSuccess(null);
  }

  async function createHold(startAt: string) {
    try {
      setError("");
      const resp = await apiPost<{ holdId: string; expiresAt: string }>(
        `/public/${tenantSlug}/holds`,
        {
          serviceId,
          staffId,
          startAt,
          clientPhone: normalizedPhone || undefined
        },
        { tenantSlug }
      );
      setHoldId(resp.holdId);
      setHoldExpiresAt(resp.expiresAt);
      setSlotStartAt(startAt);
      setStep(4);
    } catch (e: any) {
      setError("Не удалось зафиксировать время. Возможно, слот уже заняли. Обновите список.");
    }
  }

  async function confirmBooking() {
    const name = clientName.trim();
    const phone = normalizeRuPhone(clientPhone);
    if (!name) {
      setError("Введите имя.");
      return;
    }
    if (!phone) {
      setError("Введите телефон в формате +7XXXXXXXXXX (можно с пробелами/скобками).");
      return;
    }

    try {
      setError("");
      if (!holdId) {
        setError("Слот не зафиксирован. Выберите время заново.");
        setStep(3);
        return;
      }
      const resp = await apiPost(
        `/public/${tenantSlug}/bookings`,
        {
          holdId,
          clientName: name,
          clientPhone: phone,
          notes: notes.trim() || undefined,
          consentMarketing: consent
        },
        { tenantSlug }
      );
      setSuccess(resp);
    } catch {
      setError("Не удалось подтвердить запись. Попробуйте заново выбрать время.");
      setStep(3);
      setHoldId("");
      setHoldExpiresAt("");
      setSlotStartAt("");
    }
  }

  const currencyFallback = tenant.currency || selectedService?.currency || "RUB";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6">
          <div className="text-2xl font-semibold">Онлайн-запись</div>
          <div className="text-sm text-zinc-400">
            Компания: <b className="text-zinc-200">{tenant.name ?? tenantSlug}</b>{" "}
            <span className="text-zinc-500">({tenantSlug})</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">{error}</div>
        )}

        {success ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6">
            <div className="text-xl font-semibold">Запись подтверждена ✅</div>
            <div className="mt-2 text-sm text-zinc-200">
              <div>
                Услуга: <b>{success.booking.serviceName}</b>
              </div>
              <div>
                Мастер: <b>{success.booking.staffName}</b>
              </div>
              <div>
                Время: <b>{new Date(success.booking.startAt).toLocaleString("ru-RU")}</b>
              </div>
              <div>
                Стоимость: <b>{fmtMoney(success.booking.priceCents, success.booking.currency || currencyFallback)}</b>
              </div>
              <div>
                Телефон: <b>{success.booking.clientPhone}</b>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-600"
                onClick={resetToStep1}
              >
                Новая запись
              </button>
            </div>
            <div className="mt-4 text-sm text-zinc-300">
              Напоминания отправляются только при наличии согласия на рассылку.
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2 space-y-4">
              <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 ${step === 1 ? "" : "opacity-85"}`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-lg font-semibold">1) Выберите услугу</div>
                  {serviceId && (
                    <button className="text-sm text-zinc-300 hover:text-zinc-100" onClick={resetToStep1}>
                      Сбросить
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        serviceId === s.id ? "border-emerald-400/60 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-700"
                      }`}
                      onClick={() => {
                        setServiceId(s.id);
                        resetAfterService();
                      }}
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className="text-sm text-zinc-400">
                        {s.durationMinutes} мин • {fmtMoney(s.priceCents, s.currency || currencyFallback)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 ${step >= 2 ? "" : "opacity-60"}`}>
                <div className="mb-3 text-lg font-semibold">2) Выберите мастера</div>
                {!serviceId ? (
                  <div className="text-sm text-zinc-400">Сначала выберите услугу.</div>
                ) : staff.length === 0 ? (
                  <div className="text-sm text-zinc-400">Нет активных сотрудников (или список ещё загружается).</div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {staff.map((m) => (
                      <button
                        key={m.id}
                        className={`rounded-xl border px-4 py-3 text-left transition ${
                          staffId === m.id ? "border-emerald-400/60 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-700"
                        }`}
                        onClick={() => {
                          setStaffId(m.id);
                          setStep(3);
                        }}
                      >
                        <div className="font-medium">{m.displayName}</div>
                        <div className="text-sm text-zinc-400">Доступен по расписанию</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 ${step >= 3 ? "" : "opacity-60"}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-lg font-semibold">3) Выберите дату и время</div>
                  <input
                    type="date"
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={!serviceId || !staffId}
                  />
                </div>

                {!serviceId || !staffId ? (
                  <div className="text-sm text-zinc-400">Выберите услугу и мастера.</div>
                ) : slots.length === 0 ? (
                  <div className="text-sm text-zinc-400">Свободных слотов нет (или они ещё не загрузились).</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <button
                        key={s.startAt}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-700"
                        onClick={() => createHold(s.startAt)}
                      >
                        {toLocalTimeLabel(s.startAt)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="text-lg font-semibold">Подтверждение</div>

              <div className="mt-2 text-sm text-zinc-400">
                {selectedService ? (
                  <>
                    <div>
                      Услуга: <b className="text-zinc-200">{selectedService.name}</b>
                    </div>
                    <div>
                      Цена: <b className="text-zinc-200">{fmtMoney(selectedService.priceCents, selectedService.currency || currencyFallback)}</b>
                    </div>
                  </>
                ) : (
                  "Выберите услугу, мастера и время."
                )}
              </div>

              {step < 4 ? (
                <div className="mt-4 text-sm text-zinc-400">
                  Чтобы перейти к подтверждению — выберите слот (он будет зафиксирован на несколько минут).
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm">
                    <div>
                      Время зафиксировано до:{" "}
                      <b>{new Date(holdExpiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</b>
                      {typeof secondsLeft === "number" && (
                        <span className="text-zinc-300"> • осталось: <b>{secondsLeft}</b> сек</span>
                      )}
                    </div>
                    <div className="mt-1 text-zinc-300">
                      Выбрано: <b>{new Date(slotStartAt).toLocaleString("ru-RU")}</b>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="mb-1 text-sm text-zinc-300">Имя</div>
                      <input
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Например: Ирина Петрова"
                      />
                    </div>

                    <div>
                      <div className="mb-1 text-sm text-zinc-300">Телефон</div>
                      <input
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        placeholder="+7 (999) 123-45-67"
                        inputMode="tel"
                      />
                      <div className={`mt-1 text-xs ${phoneOk || !clientPhone ? "text-zinc-500" : "text-red-300"}`}>
                        {clientPhone
                          ? phoneOk
                            ? `Будет сохранён как: ${normalizedPhone}`
                            : "Нужен формат +7XXXXXXXXXX (допустимы пробелы/скобки/дефисы)"
                          : "Формат: +7XXXXXXXXXX"}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-sm text-zinc-300">Комментарий</div>
                      <textarea
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Пожелания (необязательно)"
                        rows={3}
                      />
                    </div>

                    <label className="flex items-start gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-1"
                      />
                      <span>Согласен(на) на уведомления и рассылку</span>
                    </label>

                    <button
                      className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                      disabled={!clientName.trim() || !phoneOk || !holdId}
                      onClick={confirmBooking}
                    >
                      Подтвердить запись
                    </button>

                    <button
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm hover:border-zinc-600"
                      onClick={() => {
                        setHoldId("");
                        setHoldExpiresAt("");
                        setSlotStartAt("");
                        setStep(3);
                      }}
                    >
                      Выбрать другое время
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
FILE

cat > frontend/app/[tenant]/booking/page.tsx <<'FILE'
import BookingFlow from "@/app/_public/BookingFlow";

export default function TenantBookingPage({ params }: { params: { tenant: string } }) {
  return <BookingFlow tenantSlug={params.tenant} />;
}
FILE

cat > frontend/app/lime/booking/page.tsx <<'FILE'
import BookingFlow from "@/app/_public/BookingFlow";

export default function LimeBookingPage() {
  return <BookingFlow tenantSlug="lime" />;
}
FILE

cat > frontend/app/booking/page.tsx <<'FILE'
import Link from "next/link";

export default function BookingRootPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8">
          <h1 className="text-2xl font-semibold">Онлайн-запись</h1>
          <p className="mt-3 text-zinc-300">
            Выберите компанию (tenant) по slug. Демо: <b>lime</b>.
          </p>

          <div className="mt-6">
            <Link
              href="/lime/booking"
              className="inline-flex rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Перейти к записи: lime
            </Link>
          </div>

          <div className="mt-6 text-sm text-zinc-400">
            Общий формат: <code className="text-zinc-200">/{'{tenantSlug}'}/booking</code>
          </div>
        </div>
      </div>
    </main>
  );
}
FILE

echo "[OK] Files updated. Restarting containers..."

docker compose -f infra/docker-compose.yml restart backend frontend

echo "[OK] Done. If you want RUB/+7 demo data in DB, run: make seed"
