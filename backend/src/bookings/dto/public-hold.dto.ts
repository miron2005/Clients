import { IsISO8601, IsOptional, IsString, MinLength } from "class-validator";

export class PublicHoldDto {
  @IsString({ message: "serviceId обязателен." })
  serviceId!: string;

  @IsString({ message: "staffId обязателен." })
  staffId!: string;

  @IsISO8601({}, { message: "startAt должен быть ISO-датой (например 2026-02-10T10:00:00.000Z)." })
  startAt!: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: "Телефон слишком короткий." })
  clientPhone?: string;
}

