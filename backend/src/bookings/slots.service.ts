import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { addMinutes } from "date-fns";
import { parseDateInTzToUtc, weekdayIsoMon1Sun7, addMinutesUtc, iso } from "../common/utils/time";
import { BookingStatus } from "@prisma/client";

type Slot = { startAt: string; endAt: string };

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  private stepMinutes(): number {
    return Number(process.env.SLOT_STEP_MINUTES ?? 15);
  }

  async listSlots(args: {
    tenantId: string;
    tenantTz: string;
    serviceId: string;
    staffId: string;
    date: string; // YYYY-MM-DD
  }): Promise<Slot[]> {
    const service = await this.prisma.service.findFirst({
      where: { id: args.serviceId, tenantId: args.tenantId, isActive: true }
    });
    if (!service) return [];

    const staff = await this.prisma.staffProfile.findFirst({
      where: { id: args.staffId, tenantId: args.tenantId, isActive: true }
    });
    if (!staff) return [];

    const dayStartUtc = parseDateInTzToUtc(args.date, args.tenantTz);
    const dayEndUtc = addMinutes(dayStartUtc, 24 * 60);

    const weekday = weekdayIsoMon1Sun7(dayStartUtc, args.tenantTz);

    const rule = await this.prisma.availabilityRule.findFirst({
      where: { tenantId: args.tenantId, staffId: args.staffId, weekday }
    });
    if (!rule) return [];

    const now = new Date();

    const bookings = await this.prisma.booking.findMany({
      where: {
        tenantId: args.tenantId,
        staffId: args.staffId,
        startAt: { lt: dayEndUtc },
        endAt: { gt: dayStartUtc },
        status: { not: BookingStatus.cancelled }
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

    const slots: Slot[] = [];

    for (let m = rule.startMinute; m + duration <= rule.endMinute; m += step) {
      // Обеденный перерыв
      if (
        rule.breakStartMinute != null &&
        rule.breakEndMinute != null
      ) {
        const slotEndMin = m + duration;
        const overlapBreak = m < rule.breakEndMinute && slotEndMin > rule.breakStartMinute;
        if (overlapBreak) continue;
      }

      const startAtUtc = addMinutesUtc(dayStartUtc, m);
      const endAtUtc = addMinutes(startAtUtc, duration);

      // Только будущие слоты
      if (startAtUtc.getTime() <= now.getTime()) continue;

      const overlapsAny = (arr: { startAt: Date; endAt: Date }[]) =>
        arr.some((x) => x.startAt < endAtUtc && x.endAt > startAtUtc);

      if (overlapsAny(bookings) || overlapsAny(holds)) continue;

      slots.push({ startAt: iso(startAtUtc), endAt: iso(endAtUtc) });
    }

    return slots;
  }
}

