import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as  bcrypt from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

type LoginResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; role: Role; tenantId: string };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  private accessTtlSeconds(): number {
    return Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);
  }

  private refreshTtlSeconds(): number {
    return Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2592000);
  }

  private async issueTokens(params: {
    userId: string;
    email: string;
    name: string;
    tenantId: string;
    role: Role;
    userAgent?: string;
    ip?: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: params.userId,
        tenantId: params.tenantId,
        role: params.role,
        email: params.email,
        name: params.name
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: this.accessTtlSeconds()
      }
    );

    // Refresh token = JWT с tokenId (jti) + запись в БД с хэшем
    const tokenId = uuidv4();
    const refreshToken = await this.jwt.signAsync(
      { sub: params.userId, tokenId },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: this.refreshTtlSeconds()
      }
    );

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

  async login(args: {
    tenantId: string;
    email: string;
    password: string;
    userAgent?: string;
    ip?: string;
  }): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: args.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Неверный email или пароль.");
    }

    const ok = await bcrypt.compare(args.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Неверный email или пароль.");
    }

    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: args.tenantId, userId: user.id } }
    });

    if (!membership) {
      throw new UnauthorizedException("У пользователя нет доступа к этой компании (tenant).");
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

  async refresh(args: { tenantId: string; refreshToken: string; userAgent?: string; ip?: string }) {
    // 1) Проверяем подпись refresh JWT
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(args.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET
      });
    } catch {
      throw new UnauthorizedException("Некорректный refreshToken.");
    }

    const userId = payload?.sub as string | undefined;
    const tokenId = payload?.tokenId as string | undefined;
    if (!userId || !tokenId) {
      throw new UnauthorizedException("Некорректный refreshToken.");
    }

    // 2) Ищем запись refresh в БД
    const dbToken = await this.prisma.refreshToken.findUnique({ where: { tokenId } });
    if (!dbToken || dbToken.userId !== userId) {
      throw new UnauthorizedException("refreshToken не найден или уже отозван.");
    }
    if (dbToken.revokedAt) {
      throw new UnauthorizedException("refreshToken уже отозван.");
    }
    if (dbToken.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("refreshToken истёк.");
    }

    // 3) Сверяем хэш токена (защита от подмены)
    const match = await bcrypt.compare(args.refreshToken, dbToken.tokenHash);
    if (!match) {
      throw new UnauthorizedException("refreshToken недействителен.");
    }

    // 4) Проверяем membership в tenant
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Пользователь не найден.");

    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: args.tenantId, userId } }
    });
    if (!membership) {
      throw new UnauthorizedException("У пользователя нет доступа к этой компании (tenant).");
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

  async logout(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET
      });
    } catch {
      throw new BadRequestException("Некорректный refreshToken.");
    }

    const tokenId = payload?.tokenId as string | undefined;
    if (!tokenId) throw new BadRequestException("Некорректный refreshToken.");

    const dbToken = await this.prisma.refreshToken.findUnique({ where: { tokenId } });
    if (!dbToken) return { ok: true };

    await this.prisma.refreshToken.update({
      where: { tokenId },
      data: { revokedAt: new Date() }
    });

    return { ok: true };
  }
}

