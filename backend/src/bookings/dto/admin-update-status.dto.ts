import { BookingStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class AdminUpdateBookingStatusDto {
  @IsEnum(BookingStatus, { message: "Некорректный статус записи." })
  status!: BookingStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  internalNote?: string;
}

