"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminCreateBookingDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class AdminCreateBookingDto {
    serviceId;
    staffId;
    startAt;
    clientName;
    clientPhone;
    consentMarketing;
    notes;
    internalNote;
}
exports.AdminCreateBookingDto = AdminCreateBookingDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: "b4b0c9b8-6b6a-4a9c-9f0b-9a9a9a9a9a9a", description: "ID услуги" }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AdminCreateBookingDto.prototype, "serviceId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        example: "c3c3c3c3-1111-2222-3333-444444444444",
        description: "ID мастера (staffProfile). Для роли staff игнорируется — берём профиль сотрудника автоматически."
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AdminCreateBookingDto.prototype, "staffId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: "2026-02-06T10:00:00.000Z", description: "Начало записи (ISO8601)" }),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], AdminCreateBookingDto.prototype, "startAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: "Артур", description: "Имя клиента" }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminCreateBookingDto.prototype, "clientName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: "+79991234567", description: "Телефон клиента" }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminCreateBookingDto.prototype, "clientPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: true, description: "Согласие на сообщения/маркетинг (для reminders)" }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AdminCreateBookingDto.prototype, "consentMarketing", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: "Комментарий клиента", description: "Заметка клиента" }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminCreateBookingDto.prototype, "notes", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: "Внутренняя заметка", description: "Внутренняя заметка (не видна клиенту)" }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminCreateBookingDto.prototype, "internalNote", void 0);
//# sourceMappingURL=admin-create-booking.dto.js.map