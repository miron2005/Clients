import { Module } from "@nestjs/common";
import { TenancyModule } from "../tenancy/tenancy.module";
import { CatalogModule } from "../catalog/catalog.module";
import { JobsModule } from "../jobs/jobs.module";

import { SlotsService } from "./slots.service";
import { BookingsService } from "./bookings.service";
import { PublicBookingController } from "./public-booking.controller";
import { AdminBookingsController } from "./admin-bookings.controller";

@Module({
  imports: [TenancyModule, CatalogModule, JobsModule],
  providers: [SlotsService, BookingsService],
  controllers: [PublicBookingController, AdminBookingsController]
})
export class BookingsModule {}

