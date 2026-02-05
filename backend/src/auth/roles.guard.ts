import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./roles.decorator";
import { Role } from "@prisma/client";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass()
    ]);

    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const role: Role | undefined = req.auth?.role;
    if (!role) return false;

    return required.includes(role);
  }
}

