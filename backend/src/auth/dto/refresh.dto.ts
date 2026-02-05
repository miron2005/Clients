import { IsString, MinLength } from "class-validator";

export class RefreshDto {
  @IsString({ message: "refreshToken обязателен." })
  @MinLength(10, { message: "Некорректный refreshToken." })
  refreshToken!: string;
}

