import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

@Injectable()
export class TenantRequiredGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    return Boolean(req.tenant?.id);
  }
}

