import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class PublicBookingDto {
  @IsString({ message: "holdId обязателен." })
  holdId!: string;

  @IsString({ message: "Имя клиента обязательно." })
  @MinLength(2, { message: "Имя слишком короткое." })
  clientName!: string;

  @IsString({ message: "Телефон обязателен." })
  @MinLength(6, { message: "Телефон слишком короткий." })
  clientPhone!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsBoolean({ message: "consentMarketing должен быть true/false." })
  consentMarketing!: boolean;

  // В Part 3 Telegram привяжем позже, пока используем TELEGRAM_TEST_CHAT_ID.
}

