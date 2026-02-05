"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingsModule = void 0;
const common_1 = require("@nestjs/common");
const tenancy_module_1 = require("../tenancy/tenancy.module");
const catalog_module_1 = require("../catalog/catalog.module");
const jobs_module_1 = require("../jobs/jobs.module");
const slots_service_1 = require("./slots.service");
const bookings_service_1 = require("./bookings.service");
const public_booking_controller_1 = require("./public-booking.controller");
const admin_bookings_controller_1 = require("./admin-bookings.controller");
let BookingsModule = class BookingsModule {
};
exports.BookingsModule = BookingsModule;
exports.BookingsModule = BookingsModule = __decorate([
    (0, common_1.Module)({
        imports: [tenancy_module_1.TenancyModule, catalog_module_1.CatalogModule, jobs_module_1.JobsModule],
        providers: [slots_service_1.SlotsService, bookings_service_1.BookingsService],
        controllers: [public_booking_controller_1.PublicBookingController, admin_bookings_controller_1.AdminBookingsController]
    })
], BookingsModule);
//# sourceMappingURL=bookings.module.js.map