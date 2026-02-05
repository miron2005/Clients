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
exports.PublicBookingDto = void 0;
const class_validator_1 = require("class-validator");
class PublicBookingDto {
    holdId;
    clientName;
    clientPhone;
    notes;
    consentMarketing;
}
exports.PublicBookingDto = PublicBookingDto;
__decorate([
    (0, class_validator_1.IsString)({ message: "holdId обязателен." }),
    __metadata("design:type", String)
], PublicBookingDto.prototype, "holdId", void 0);
__decorate([
    (0, class_validator_1.IsString)({ message: "Имя клиента обязательно." }),
    (0, class_validator_1.MinLength)(2, { message: "Имя слишком короткое." }),
    __metadata("design:type", String)
], PublicBookingDto.prototype, "clientName", void 0);
__decorate([
    (0, class_validator_1.IsString)({ message: "Телефон обязателен." }),
    (0, class_validator_1.MinLength)(6, { message: "Телефон слишком короткий." }),
    __metadata("design:type", String)
], PublicBookingDto.prototype, "clientPhone", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PublicBookingDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)({ message: "consentMarketing должен быть true/false." }),
    __metadata("design:type", Boolean)
], PublicBookingDto.prototype, "consentMarketing", void 0);
//# sourceMappingURL=public-booking.dto.js.map