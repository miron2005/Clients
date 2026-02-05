import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { TenantRequiredGuard } from "../tenancy/tenant-required.guard";

@ApiTags("Авторизация")
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("/auth/login")
  @UseGuards(TenantRequiredGuard)
  async login(@Req() req: any, @Body() dto: LoginDto) {
    const tenantId = req.tenant.id as string;
    return this.auth.login({
      tenantId,
      email: dto.email.toLowerCase().trim(),
      password: dto.password,
      userAgent: req.headers["user-agent"],
      ip: req.ip
    });
  }

  @Post("/auth/refresh")
  @UseGuards(TenantRequiredGuard)
  async refresh(@Req() req: any, @Body() dto: RefreshDto) {
    const tenantId = req.tenant.id as string;
    return this.auth.refresh({
      tenantId,
      refreshToken: dto.refreshToken,
      userAgent: req.headers["user-agent"],
      ip: req.ip
    });
  }

  @Post("/auth/logout")
  async logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get("/me")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantRequiredGuard)
  async me(@Req() req: any) {
    return {
      tenant: req.tenant,
      user: req.auth
    };
  }
}

