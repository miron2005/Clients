import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { TenancyService } from "./tenancy.service";

@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  constructor(private readonly tenancy: TenancyService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Тenant slug берём из заголовка x-tenant (основной способ)
    const slugHeader = req.headers["x-tenant"];
    const slug = Array.isArray(slugHeader) ? slugHeader[0] : slugHeader;

    if (!slug) {
      // Для служебных endpoint’ов (health) tenant не обязателен
      return next();
    }

    const tenant = await this.tenancy.resolveTenantBySlug(String(slug).trim());
    if (!tenant) {
      return res.status(400).json({
        message: "Неизвестный tenant. Проверьте заголовок x-tenant (например: lime)."
      });
    }

    req.tenant = {
      id: tenant.id,
      slug: tenant.slug,
      timezone: tenant.timezone,
      currency: tenant.currency
    };

    return next();
  }
}

