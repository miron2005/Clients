import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingService } from "../messaging/messaging.service";
import { BookingStatus } from "@prisma/client";

type ReminderJobData = {
  tenantId: string;
  bookingId: string;
  templateKey: "reminder_24h" | "reminder_2h";
};

@Processor("reminders")
export class RemindersProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService
  ) {
    super();
  }

  async process(job: Job<ReminderJobData>) {
    const { tenantId, bookingId, templateKey } = job.data;

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: { client: true }
    });

    if (!booking) return;
    if (booking.status !== BookingStatus.planned) return;
    if (!booking.client.consentMarketing) return;

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

  @OnWorkerEvent("failed")
  onFailed(job: Job, err: Error) {
    // eslint-disable-next-line no-console
    console.error("[reminders] job failed:", job?.id, err?.message);
  }
}

