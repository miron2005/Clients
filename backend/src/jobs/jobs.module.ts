import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { RemindersService } from "./reminders.service";
import { RemindersProcessor } from "./reminders.processor";

function redisConnection() {
  const url = process.env.REDIS_URL ?? "redis://redis:6379";
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || "6379"),
    password: u.password || undefined
  };
}

@Module({
  imports: [
    BullModule.forRoot({
      connection: redisConnection()
    }),
    BullModule.registerQueue({
      name: "reminders"
    })
  ],
  providers: [RemindersService, RemindersProcessor],
  exports: [RemindersService]
})
export class JobsModule {}

