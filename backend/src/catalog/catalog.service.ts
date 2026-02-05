import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TenancyService } from "../tenancy/tenancy.service";

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService
  ) {}

  async getTenantBySlugOrThrow(slug: string) {
    const tenant = await this.tenancy.resolveTenantBySlug(slug);
    if (!tenant) throw new NotFoundException("Компания (tenant) не найдена.");
    return tenant;
  }

  async listServices(tenantId: string) {
    return this.prisma.service.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
  }

  async listStaff(tenantId: string) {
    return this.prisma.staffProfile.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ displayName: "asc" }]
    });
  }
}

