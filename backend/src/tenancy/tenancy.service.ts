import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TenancyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantBySlug(slug: string) {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }
}

