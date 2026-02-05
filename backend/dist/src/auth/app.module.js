"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const prisma_module_1 = require("./prisma/prisma.module");
const tenancy_module_1 = require("./tenancy/tenancy.module");
const tenancy_middleware_1 = require("./tenancy/tenancy.middleware");
const health_controller_1 = require("./health.controller");
const auth_module_1 = require("./auth/auth.module");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(tenancy_middleware_1.TenancyMiddleware).forRoutes("*");
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    ttl: 60_000,
                    limit: 120
                }
            ]),
            prisma_module_1.PrismaModule,
            tenancy_module_1.TenancyModule,
            auth_module_1.AuthModule
        ],
        controllers: [health_controller_1.HealthController]
    })
], AppModule);
//# sourceMappingURL=app.module.js.map