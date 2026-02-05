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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = require("bcryptjs");
const jwt_1 = require("@nestjs/jwt");
const uuid_1 = require("uuid");
let AuthService = class AuthService {
    prisma;
    jwt;
    constructor(prisma, jwt) {
        this.prisma = prisma;
        this.jwt = jwt;
    }
    accessTtlSeconds() {
        return Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);
    }
    refreshTtlSeconds() {
        return Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2592000);
    }
    async issueTokens(params) {
        const accessToken = await this.jwt.signAsync({
            sub: params.userId,
            tenantId: params.tenantId,
            role: params.role,
            email: params.email,
            name: params.name
        }, {
            secret: process.env.JWT_ACCESS_SECRET,
            expiresIn: this.accessTtlSeconds()
        });
        // Refresh token = JWT с tokenId (jti) + запись в БД с хэшем
        const tokenId = (0, uuid_1.v4)();
        const refreshToken = await this.jwt.signAsync({ sub: params.userId, tokenId }, {
            secret: process.env.JWT_REFRESH_SECRET,
            expiresIn: this.refreshTtlSeconds()
        });
        const tokenHash = await bcrypt.hash(refreshToken, 10);
        const expiresAt = new Date(Date.now() + this.refreshTtlSeconds() * 1000);
        await this.prisma.refreshToken.create({
            data: {
                userId: params.userId,
                tokenId,
                tokenHash,
                expiresAt,
                userAgent: params.userAgent,
                ip: params.ip
            }
        });
        return { accessToken, refreshToken };
    }
    async login(args) {
        const user = await this.prisma.user.findUnique({ where: { email: args.email } });
        if (!user || !user.isActive) {
            throw new common_1.UnauthorizedException("Неверный email или пароль.");
        }
        const ok = await bcrypt.compare(args.password, user.passwordHash);
        if (!ok) {
            throw new common_1.UnauthorizedException("Неверный email или пароль.");
        }
        const membership = await this.prisma.membership.findUnique({
            where: { tenantId_userId: { tenantId: args.tenantId, userId: user.id } }
        });
        if (!membership) {
            throw new common_1.UnauthorizedException("У пользователя нет доступа к этой компании (tenant).");
        }
        const tokens = await this.issueTokens({
            userId: user.id,
            email: user.email,
            name: user.name,
            tenantId: args.tenantId,
            role: membership.role,
            userAgent: args.userAgent,
            ip: args.ip
        });
        return {
            ...tokens,
            user: { id: user.id, email: user.email, name: user.name, role: membership.role, tenantId: args.tenantId }
        };
    }
    async refresh(args) {
        // 1) Проверяем подпись refresh JWT
        let payload;
        try {
            payload = await this.jwt.verifyAsync(args.refreshToken, {
                secret: process.env.JWT_REFRESH_SECRET
            });
        }
        catch {
            throw new common_1.UnauthorizedException("Некорректный refreshToken.");
        }
        const userId = payload?.sub;
        const tokenId = payload?.tokenId;
        if (!userId || !tokenId) {
            throw new common_1.UnauthorizedException("Некорректный refreshToken.");
        }
        // 2) Ищем запись refresh в БД
        const dbToken = await this.prisma.refreshToken.findUnique({ where: { tokenId } });
        if (!dbToken || dbToken.userId !== userId) {
            throw new common_1.UnauthorizedException("refreshToken не найден или уже отозван.");
        }
        if (dbToken.revokedAt) {
            throw new common_1.UnauthorizedException("refreshToken уже отозван.");
        }
        if (dbToken.expiresAt.getTime() < Date.now()) {
            throw new common_1.UnauthorizedException("refreshToken истёк.");
        }
        // 3) Сверяем хэш токена (защита от подмены)
        const match = await bcrypt.compare(args.refreshToken, dbToken.tokenHash);
        if (!match) {
            throw new common_1.UnauthorizedException("refreshToken недействителен.");
        }
        // 4) Проверяем membership в tenant
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.UnauthorizedException("Пользователь не найден.");
        const membership = await this.prisma.membership.findUnique({
            where: { tenantId_userId: { tenantId: args.tenantId, userId } }
        });
        if (!membership) {
            throw new common_1.UnauthorizedException("У пользователя нет доступа к этой компании (tenant).");
        }
        // 5) Ротация refresh: отзываем старый, выдаём новый
        await this.prisma.refreshToken.update({
            where: { tokenId },
            data: { revokedAt: new Date() }
        });
        const tokens = await this.issueTokens({
            userId: user.id,
            email: user.email,
            name: user.name,
            tenantId: args.tenantId,
            role: membership.role,
            userAgent: args.userAgent,
            ip: args.ip
        });
        return {
            ...tokens
        };
    }
    async logout(refreshToken) {
        let payload;
        try {
            payload = await this.jwt.verifyAsync(refreshToken, {
                secret: process.env.JWT_REFRESH_SECRET
            });
        }
        catch {
            throw new common_1.BadRequestException("Некорректный refreshToken.");
        }
        const tokenId = payload?.tokenId;
        if (!tokenId)
            throw new common_1.BadRequestException("Некорректный refreshToken.");
        const dbToken = await this.prisma.refreshToken.findUnique({ where: { tokenId } });
        if (!dbToken)
            return { ok: true };
        await this.prisma.refreshToken.update({
            where: { tokenId },
            data: { revokedAt: new Date() }
        });
        return { ok: true };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map