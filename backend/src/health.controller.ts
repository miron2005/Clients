import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Служебное")
@Controller()
export class HealthController {
  @Get("/health")
  health() {
    return { ok: true, message: "Сервис работает" };
  }
}

