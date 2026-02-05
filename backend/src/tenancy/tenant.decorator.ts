import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const Tenant = createParamDecorator((_, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.tenant;
});

