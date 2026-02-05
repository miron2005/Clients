"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tenant = void 0;
const common_1 = require("@nestjs/common");
exports.Tenant = (0, common_1.createParamDecorator)((_, ctx) => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenant;
});
//# sourceMappingURL=tenant.decorator.js.map