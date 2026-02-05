"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const helmet_1 = require("helmet");
const swagger_1 = require("@nestjs/swagger");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    // DEV-настройки безопасности:
    // - Отключаем CSP/COOP/CORP, т.к. Swagger UI в Safari может белеть
    // - На localhost HSTS не нужен
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: false,
        hsts: false
    }));
    app.enableCors({
        origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
        credentials: true
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
    }));
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle("YC-like API (Демо)")
        .setDescription("Swagger документация (в разработке)")
        .setVersion("1.0.0")
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup("/api/docs", app, document, {
        swaggerOptions: {
            url: "/api/docs-json",
            persistAuthorization: true
        }
    });
    const port = Number(process.env.PORT ?? 3001);
    await app.listen(port);
    // eslint-disable-next-line no-console
    console.log(`API запущен: http://localhost:${port}`);
    // eslint-disable-next-line no-console
    console.log(`Swagger:     http://localhost:${port}/api/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map