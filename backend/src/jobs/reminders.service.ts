import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";

type ReminderJobData = {
  tenantId: string;
  bookingId: string;
  templateKey: "reminder_24h" | "reminder_2h";
};

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue("reminders") private readonly queue: Queue
  ) {}

  async scheduleForBooking(bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId },
      include: { tenant: true, client: true }
    });
    if (!booking) return;

    // Только если есть согласие
    if (!booking.client.consentMarketing) return;

    const now = Date.now();
    const start = booking.startAt.getTime();

    const offsets = [
      { key: "reminder_24h" as const, ms: 24 * 60 * 60 * 1000 },
      { key: "reminder_2h" as const, ms: 2 * 60 * 60 * 1000 }
    ];

    for (const o of offsets) {
      const remindAt = start - o.ms;
      const delay = remindAt - now;
      if (delay <= 0) continue;

      const jobId = `booking:${booking.id}:${o.key}`;

      await this.queue.add(
        "send",
        {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          templateKey: o.key
        } satisfies ReminderJobData,
        {
          jobId,
          delay,
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: 50
        }
      );
    }
  }
}

