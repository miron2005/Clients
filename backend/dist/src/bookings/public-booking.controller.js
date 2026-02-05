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
exports.PublicBookingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const catalog_service_1 = require("../catalog/catalog.service");
const slots_service_1 = require("./slots.service");
const bookings_service_1 = require("./bookings.service");
const public_hold_dto_1 = require("./dto/public-hold.dto");
const public_booking_dto_1 = require("./dto/public-booking.dto");
let PublicBookingController = class PublicBookingController {
    catalog;
    slots;
    bookings;
    constructor(catalog, slots, bookings) {
        this.catalog = catalog;
        this.slots = slots;
        this.bookings = bookings;
    }
    async slotsForDay(tenantSlug, serviceId, staffId, date) {
        const tenant = await this.catalog.getTenantBySlugOrThrow(tenantSlug);
        const slots = await this.slots.listSlots({
            tenantId: tenant.id,
            tenantTz: tenant.timezone,
            serviceId,
            staffId,
            date
        });
        return { tenant: { slug: tenant.slug, timezone: tenant.timezone }, slots };
    }
    async createHold(tenantSlug, dto) {
        const tenant = await this.catalog.getTenantBySlugOrThrow(tenantSlug);
        return this.bookings.createHold({
            tenantId: tenant.id,
            tenantTz: tenant.timezone,
            serviceId: dto.serviceId,
            staffId: dto.staffId,
            startAtIso: dto.startAt,
            clientPhone: dto.clientPhone
        });
    }
    async confirm(tenantSlug, dto) {
        const tenant = await this.catalog.getTenantBySlugOrThrow(tenantSlug);
        return this.bookings.confirmBooking({
            tenantId: tenant.id,
            tenantTz: tenant.timezone,
            holdId: dto.holdId,
            clientName: dto.clientName,
            clientPhone: dto.clientPhone,
            consentMarketing: dto.consentMarketing,
            notes: dto.notes
        });
    }
};
exports.PublicBookingController = PublicBookingController;
__decorate([
    (0, common_1.Get)("/slots"),
    (0, swagger_1.ApiParam)({ name: "tenantSlug", example: "lime" }),
    (0, swagger_1.ApiQuery)({ name: "serviceId", required: true }),
    (0, swagger_1.ApiQuery)({ name: "staffId", required: true }),
    (0, swagger_1.ApiQuery)({ name: "date", required: true, example: "2026-02-10" }),
    __param(0, (0, common_1.Param)("tenantSlug")),
    __param(1, (0, common_1.Query)("serviceId")),
    __param(2, (0, common_1.Query)("staffId")),
    __param(3, (0, common_1.Query)("date")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], PublicBookingController.prototype, "slotsForDay", null);
__decorate([
    (0, common_1.Post)("/holds"),
    (0, swagger_1.ApiParam)({ name: "tenantSlug", example: "lime" }),
    __param(0, (0, common_1.Param)("tenantSlug")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, public_hold_dto_1.PublicHoldDto]),
    __metadata("design:returntype", Promise)
], PublicBookingController.prototype, "createHold", null);
__decorate([
    (0, common_1.Post)("/bookings"),
    (0, swagger_1.ApiParam)({ name: "tenantSlug", example: "lime" }),
    __param(0, (0, common_1.Param)("tenantSlug")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, public_booking_dto_1.PublicBookingDto]),
    __metadata("design:returntype", Promise)
], PublicBookingController.prototype, "confirm", null);
exports.PublicBookingController = PublicBookingController = __decorate([
    (0, swagger_1.ApiTags)("Публичное: онлайн-запись"),
    (0, common_1.Controller)("/public/:tenantSlug"),
    __metadata("design:paramtypes", [catalog_service_1.CatalogService,
        slots_service_1.SlotsService,
        bookings_service_1.BookingsService])
], PublicBookingController);
//# sourceMappingURL=public-booking.controller.js.map