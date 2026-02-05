import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  handleRequest(err: any, user: any, info: any, ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    if (user) {
      req.auth = {
        userId: user.sub,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
        name: user.name
      };
    }
    return super.handleRequest(err, user, info, ctx);
  }
}

