import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TenantRequiredGuard } from "../tenancy/tenant-required.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { BookingsService } from "./bookings.service";
import { AdminUpdateBookingStatusDto } from "./dto/admin-update-status.dto";
import { Role } from "@prisma/client";

@ApiTags("Админ: календарь записей")
@ApiBearerAuth()
@ApiHeader({ name: "x-tenant", required: true, description: "Например: lime" })
@Controller("/admin/bookings")
@UseGuards(JwtAuthGuard, TenantRequiredGuard)
export class AdminBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @ApiQuery({ name: "from", required: true, example: "2026-02-01T00:00:00.000Z" })
  @ApiQuery({ name: "to", required: true, example: "2026-02-08T00:00:00.000Z" })
  @ApiQuery({ name: "staffId", required: false })
  async list(
    @CurrentUser() user: any,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("staffId") staffId?: string
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    return this.bookings.adminListBookings({
      tenantId: user.tenantId,
      from: fromDate,
      to: toDate,
      staffId,
      requesterRole: user.role as Role,
      requesterUserId: user.userId as string
    });
  }

  @Patch("/:id/status")
  async updateStatus(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() dto: AdminUpdateBookingStatusDto
  ) {
    return this.bookings.adminUpdateStatus({
      tenantId: user.tenantId,
      bookingId: id,
      status: dto.status,
      reason: dto.reason,
      internalNote: dto.internalNote,
      actorUserId: user.userId,
      actorRole: user.role
    });
  }
}

