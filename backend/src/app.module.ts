import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { TenancyMiddleware } from "./tenancy/tenancy.middleware";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";

import { CatalogModule } from "./catalog/catalog.module";
import { BookingsModule } from "./bookings/bookings.module";
import { MessagingModule } from "./messaging/messaging.module";
import { JobsModule } from "./jobs/jobs.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120
      }
    ]),
    PrismaModule,
    TenancyModule,
    AuthModule,

    // Part 3
    MessagingModule,
    JobsModule,
    CatalogModule,
    BookingsModule
  ],
  controllers: [HealthController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenancyMiddleware).forRoutes("*");
  }
}

