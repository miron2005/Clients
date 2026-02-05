"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicCatalogController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const catalog_service_1 = require("./catalog.service");
let PublicCatalogController = class PublicCatalogController {
    catalog;
    constructor(catalog) {
        this.catalog = catalog;
    }
    async services(tenantSlug) {
        const tenant = await this.catalog.getTenantBySlugOrThrow(tenantSlug);
        const services = await this.catalog.listServices(tenant.id);
        return {
            tenant: { slug: tenant.slug, name: tenant.name, timezone: tenant.timezone, currency: tenant.currency },
            services
        };
    }
    async staff(tenantSlug, _serviceId) {
        const tenant = await this.catalog.getTenantBySlugOrThrow(tenantSlug);
        const staff = await this.catalog.listStaff(tenant.id);
        return {
            tenant: { slug: tenant.slug, name: tenant.name },
            staff
        };
    }
};
exports.PublicCatalogController = PublicCatalogController;
__decorate([
    (0, common_1.Get)("/services"),
    (0, swagger_1.ApiParam)({ name: "tenantSlug", example: "lime" }),
    __param(0, (0, common_1.Param)("tenantSlug")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicCatalogController.prototype, "services", null);
__decorate([
    (0, common_1.Get)("/staff"),
    (0, swagger_1.ApiParam)({ name: "tenantSlug", example: "lime" }),
    (0, swagger_1.ApiQuery)({ name: "serviceId", required: false, description: "Пока не фильтруем по услуге (расширим позже)" }),
    __param(0, (0, common_1.Param)("tenantSlug")),
    __param(1, (0, common_1.Query)("serviceId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PublicCatalogController.prototype, "staff", null);
exports.PublicCatalogController = PublicCatalogController = __decorate([
    (0, swagger_1.ApiTags)("Публичное: каталог"),
    (0, common_1.Controller)("/public/:tenantSlug"),
    __metadata("design:paramtypes", [catalog_service_1.CatalogService])
], PublicCatalogController);
//# sourceMappingURL=public-catalog.controller.js.map