import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CatalogService } from "./catalog.service";

@ApiTags("Публичное: каталог")
@Controller("/public/:tenantSlug")
export class PublicCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("/services")
  @ApiParam({ name: "tenantSlug", example: "lime" })
  async services(@Param("tenantSlug") tenantSlug: string) {
    const tenant = await this.catalog.getTenantBySlugOrThrow(tenantSlug);
    const services = await this.catalog.listServices(tenant.id);
    return {
      tenant: { slug: tenant.slug, name: tenant.name, timezone: tenant.timezone, currency: tenant.currency },
      services
    };
  }

  @Get("/staff")
  @ApiParam({ name: "tenantSlug", example: "lime" })
  @ApiQuery({ name: "serviceId", required: false, description: "Пока не фильтруем по услуге (расширим позже)" })
  async staff(@Param("tenantSlug") tenantSlug: string, @Query("serviceId") _serviceId?: string) {
    const tenant = await this.catalog.getTenantBySlugOrThrow(tenantSlug);
    const staff = await this.catalog.listStaff(tenant.id);
    return {
      tenant: { slug: tenant.slug, name: tenant.name },
      staff
    };
  }
}

