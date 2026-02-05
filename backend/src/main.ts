import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // DEV-настройки безопасности:
  // - Отключаем CSP/COOP/CORP, т.к. Swagger UI в Safari может белеть
  // - На localhost HSTS не нужен
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      hsts: false
    })
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    credentials: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("YC-like API (Демо)")
    .setDescription("Swagger документация (в разработке)")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup("/api/docs", app, document, {
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

