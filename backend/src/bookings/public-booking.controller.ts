import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CatalogService } from "../catalog/catalog.service";
import { SlotsService } from "./slots.service";
import { BookingsService } from "./bookings.service";
import { PublicHoldDto } from "./dto/public-hold.dto";
import { PublicBookingDto } from "./dto/public-booking.dto";

@ApiTags("Публичное: онлайн-запись")
@Controller("/public/:tenantSlug")
export class PublicBookingController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly slots: SlotsService,
    private readonly bookings: BookingsService
  ) {}

  @Get("/slots")
  @ApiParam({ name: "tenantSlug", example: "lime" })
  @ApiQuery({ name: "serviceId", required: true })
  @ApiQuery({ name: "staffId", required: true })
  @ApiQuery({ name: "date", required: true, example: "2026-02-10" })
  async slotsForDay(
    @Param("tenantSlug") tenantSlug: string,
    @Query("serviceId") serviceId: string,
    @Query("staffId") staffId: string,
    @Query("date") date: string
  ) {
    const tenant = await this.catalog.getTenantBySlugOrThrow(tenantSlug);

    const slots = await this.slots.listSlots({
      tenantId: tenant.id,
      tenantTz: tenant.timezone,
      serviceId,
      staffId,
      date
    });

    return { tenant: { slug: tenant.slug, timezone: tenant.timezone }, slots };
  }

  @Post("/holds")
  @ApiParam({ name: "tenantSlug", example: "lime" })
  async createHold(@Param("tenantSlug") tenantSlug: string, @Body() dto: PublicHoldDto) {
    const tenant = await this.catalog.getTenantBySlugOrThrow(tenantSlug);

    return this.bookings.createHold({
      tenantId: tenant.id,
      tenantTz: tenant.timezone,
      serviceId: dto.serviceId,
      staffId: dto.staffId,
      startAtIso: dto.startAt,
      clientPhone: dto.clientPhone
    });
  }

  @Post("/bookings")
  @ApiParam({ name: "tenantSlug", example: "lime" })
  async confirm(@Param("tenantSlug") tenantSlug: string, @Body() dto: PublicBookingDto) {
    const tenant = await this.catalog.getTenantBySlugOrThrow(tenantSlug);

    return this.bookings.confirmBooking({
      tenantId: tenant.id,
      tenantTz: tenant.timezone,
      holdId: dto.holdId,
      clientName: dto.clientName,
      clientPhone: dto.clientPhone,
      consentMarketing: dto.consentMarketing,
      notes: dto.notes
    });
  }
}

