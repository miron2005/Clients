import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Введите корректный email." })
  email!: string;

  @IsString({ message: "Пароль обязателен." })
  @MinLength(6, { message: "Пароль должен быть не короче 6 символов." })
  password!: string;
}

