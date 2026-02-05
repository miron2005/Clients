"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDateInTzToUtc = parseDateInTzToUtc;
exports.utcToLocalLabel = utcToLocalLabel;
exports.addMinutesUtc = addMinutesUtc;
exports.iso = iso;
exports.weekdayIsoMon1Sun7 = weekdayIsoMon1Sun7;
const date_fns_1 = require("date-fns");
const date_fns_tz_1 = require("date-fns-tz");
function parseDateInTzToUtc(dateISO, tz) {
    // dateISO: YYYY-MM-DD
    return (0, date_fns_tz_1.fromZonedTime)(`${dateISO}T00:00:00`, tz);
}
function utcToLocalLabel(dateUtc, tz) {
    const z = (0, date_fns_tz_1.toZonedTime)(dateUtc, tz);
    return (0, date_fns_1.format)(z, "dd.MM.yyyy HH:mm");
}
function addMinutesUtc(baseUtc, minutes) {
    return (0, date_fns_1.addMinutes)(baseUtc, minutes);
}
function iso(date) {
    return date.toISOString();
}
function weekdayIsoMon1Sun7(dayStartUtc, tz) {
    const z = (0, date_fns_tz_1.toZonedTime)(dayStartUtc, tz);
    const js = z.getDay(); // 0..6 (Sun..Sat)
    const map = [7, 1, 2, 3, 4, 5, 6];
    return map[js];
}
//# sourceMappingURL=time.js.map