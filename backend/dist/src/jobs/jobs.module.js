"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const reminders_service_1 = require("./reminders.service");
const reminders_processor_1 = require("./reminders.processor");
function redisConnection() {
    const url = process.env.REDIS_URL ?? "redis://redis:6379";
    const u = new URL(url);
    return {
        host: u.hostname,
        port: Number(u.port || "6379"),
        password: u.password || undefined
    };
}
let JobsModule = class JobsModule {
};
exports.JobsModule = JobsModule;
exports.JobsModule = JobsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.forRoot({
                connection: redisConnection()
            }),
            bullmq_1.BullModule.registerQueue({
                name: "reminders"
            })
        ],
        providers: [reminders_service_1.RemindersService, reminders_processor_1.RemindersProcessor],
        exports: [reminders_service_1.RemindersService]
    })
], JobsModule);
//# sourceMappingURL=jobs.module.js.map