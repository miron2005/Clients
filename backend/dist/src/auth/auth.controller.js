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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("./auth.service");
const login_dto_1 = require("./dto/login.dto");
const refresh_dto_1 = require("./dto/refresh.dto");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const tenant_required_guard_1 = require("../tenancy/tenant-required.guard");
let AuthController = class AuthController {
    auth;
    constructor(auth) {
        this.auth = auth;
    }
    async login(req, dto) {
        const tenantId = req.tenant.id;
        return this.auth.login({
            tenantId,
            email: dto.email.toLowerCase().trim(),
            password: dto.password,
            userAgent: req.headers["user-agent"],
            ip: req.ip
        });
    }
    async refresh(req, dto) {
        const tenantId = req.tenant.id;
        return this.auth.refresh({
            tenantId,
            refreshToken: dto.refreshToken,
            userAgent: req.headers["user-agent"],
            ip: req.ip
        });
    }
    async logout(dto) {
        return this.auth.logout(dto.refreshToken);
    }
    async me(req) {
        return {
            tenant: req.tenant,
            user: req.auth
        };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)("/auth/login"),
    (0, common_1.UseGuards)(tenant_required_guard_1.TenantRequiredGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, login_dto_1.LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)("/auth/refresh"),
    (0, common_1.UseGuards)(tenant_required_guard_1.TenantRequiredGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, refresh_dto_1.RefreshDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)("/auth/logout"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_dto_1.RefreshDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)("/me"),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_required_guard_1.TenantRequiredGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)("Авторизация"),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map