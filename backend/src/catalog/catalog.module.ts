import { Module } from "@nestjs/common";
import { CatalogService } from "./catalog.service";
import { PublicCatalogController } from "./public-catalog.controller";
import { TenancyModule } from "../tenancy/tenancy.module";

@Module({
  imports: [TenancyModule],
  providers: [CatalogService],
  controllers: [PublicCatalogController],
  exports: [CatalogService]
})
export class CatalogModule {}

