"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEurFromCents = formatEurFromCents;
function formatEurFromCents(cents) {
    const eur = (cents / 100).toFixed(2).replace(".", ",");
    return `${eur} €`;
}
//# sourceMappingURL=money.js.map