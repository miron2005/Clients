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
exports.AdminBookingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const tenant_required_guard_1 = require("../tenancy/tenant-required.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const bookings_service_1 = require("./bookings.service");
const admin_update_status_dto_1 = require("./dto/admin-update-status.dto");
const admin_create_booking_dto_1 = require("./dto/admin-create-booking.dto");
let AdminBookingsController = class AdminBookingsController {
    bookings;
    constructor(bookings) {
        this.bookings = bookings;
    }
    async list(user, from, to, staffId) {
        const fromDate = new Date(from);
        const toDate = new Date(to);
        return this.bookings.adminListBookings({
            tenantId: user.tenantId,
            from: fromDate,
            to: toDate,
            staffId,
            requesterRole: user.role,
            requesterUserId: user.userId
        });
    }
    async create(user, dto) {
        return this.bookings.adminCreateBooking({
            tenantId: user.tenantId,
            actorUserId: user.userId,
            actorRole: user.role,
            serviceId: dto.serviceId,
            staffId: dto.staffId,
            startAtIso: dto.startAt,
            clientName: dto.clientName,
            clientPhone: dto.clientPhone,
            consentMarketing: dto.consentMarketing ?? false,
            notes: dto.notes,
            internalNote: dto.internalNote
        });
    }
    async updateStatus(user, id, dto) {
        return this.bookings.adminUpdateStatus({
            tenantId: user.tenantId,
            bookingId: id,
            status: dto.status,
            reason: dto.reason,
            internalNote: dto.internalNote,
            actorUserId: user.userId,
            actorRole: user.role
        });
    }
};
exports.AdminBookingsController = AdminBookingsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiQuery)({ name: "from", required: true, example: "2026-02-01T00:00:00.000Z" }),
    (0, swagger_1.ApiQuery)({ name: "to", required: true, example: "2026-02-08T00:00:00.000Z" }),
    (0, swagger_1.ApiQuery)({ name: "staffId", required: false }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)("from")),
    __param(2, (0, common_1.Query)("to")),
    __param(3, (0, common_1.Query)("staffId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminBookingsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, admin_create_booking_dto_1.AdminCreateBookingDto]),
    __metadata("design:returntype", Promise)
], AdminBookingsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)("/:id/status"),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)("id")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_update_status_dto_1.AdminUpdateBookingStatusDto]),
    __metadata("design:returntype", Promise)
], AdminBookingsController.prototype, "updateStatus", null);
exports.AdminBookingsController = AdminBookingsController = __decorate([
    (0, swagger_1.ApiTags)("Админ: календарь записей"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiHeader)({ name: "x-tenant", required: true, description: "Например: lime" }),
    (0, common_1.Controller)("/admin/bookings"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_required_guard_1.TenantRequiredGuard),
    __metadata("design:paramtypes", [bookings_service_1.BookingsService])
], AdminBookingsController);
//# sourceMappingURL=admin-bookings.controller.js.map