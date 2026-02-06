export function normalizePhoneE164(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) throw new Error("Телефон обязателен.");

  // Убираем пробелы/скобки/дефисы и т.п.
  const cleaned = s.replace(/[()\-\s]/g, "");

  // Если уже похоже на E.164: + + 8..15 цифр
  if (/^\+\d{8,15}$/.test(cleaned)) {
    // Частый кейс: "+7..." — ок
    return cleaned;
  }

  // Если ввели без плюса — разбираем как РФ по цифрам
  const digits = s.replace(/\D/g, "");

  // 10 цифр (обычно без кода страны) → +7
  if (digits.length === 10) {
    return `+7${digits}`;
  }

  // 11 цифр: 8XXXXXXXXXX или 7XXXXXXXXXX → +7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7${digits.slice(1)}`;
  }

  throw new Error("Телефон должен быть в формате +7XXXXXXXXXX (допустимы пробелы/скобки/дефисы).");
}

export function isRuPhoneE164(phone: string): boolean {
  return /^\+7\d{10}$/.test(phone);
}
