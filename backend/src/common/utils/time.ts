import { addMinutes, format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export function parseDateInTzToUtc(dateISO: string, tz: string): Date {
  // dateISO: YYYY-MM-DD
  return fromZonedTime(`${dateISO}T00:00:00`, tz);
}

export function utcToLocalLabel(dateUtc: Date, tz: string): string {
  const z = toZonedTime(dateUtc, tz);
  return format(z, "dd.MM.yyyy HH:mm");
}

export function utcToDateISOInTz(dateUtc: Date, tz: string): string {
  const z = toZonedTime(dateUtc, tz);
  return format(z, "yyyy-MM-dd");
}

export function addMinutesUtc(baseUtc: Date, minutes: number): Date {
  return addMinutes(baseUtc, minutes);
}

export function iso(date: Date): string {
  return date.toISOString();
}

export function weekdayIsoMon1Sun7(dayStartUtc: Date, tz: string): number {
  const z = toZonedTime(dayStartUtc, tz);
  const js = z.getDay(); // 0..6 (Sun..Sat)
  const map = [7, 1, 2, 3, 4, 5, 6];
  return map[js];
}
