import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsISO8601, IsOptional, IsString, IsUUID } from "class-validator";

export class AdminCreateBookingDto {
  @ApiProperty({ example: "b4b0c9b8-6b6a-4a9c-9f0b-9a9a9a9a9a9a", description: "ID услуги" })
  @IsUUID()
  serviceId!: string;

  @ApiPropertyOptional({
    example: "c3c3c3c3-1111-2222-3333-444444444444",
    description: "ID мастера (staffProfile). Для роли staff игнорируется — берём профиль сотрудника автоматически."
  })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({ example: "2026-02-06T10:00:00.000Z", description: "Начало записи (ISO8601)" })
  @IsISO8601()
  startAt!: string;

  @ApiProperty({ example: "Артур", description: "Имя клиента" })
  @IsString()
  clientName!: string;

  @ApiProperty({ example: "+79991234567", description: "Телефон клиента" })
  @IsString()
  clientPhone!: string;

  @ApiPropertyOptional({ example: true, description: "Согласие на сообщения/маркетинг (для reminders)" })
  @IsOptional()
  @IsBoolean()
  consentMarketing?: boolean;

  @ApiPropertyOptional({ example: "Комментарий клиента", description: "Заметка клиента" })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: "Внутренняя заметка", description: "Внутренняя заметка (не видна клиенту)" })
  @IsOptional()
  @IsString()
  internalNote?: string;
}
