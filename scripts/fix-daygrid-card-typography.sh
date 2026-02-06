#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FILE="frontend/app/admin/calendar/page.tsx"
if [ ! -f "$FILE" ]; then
  echo "[ERR] Не найден $FILE"
  exit 1
fi

python3 - <<'PY'
from pathlib import Path
import re

p = Path("frontend/app/admin/calendar/page.tsx")
s = p.read_text(encoding="utf-8")

# 1) Находим именно booking-карточку в day-grid: она <button ... style={{ top, height, left, width ... }}>
# Меняем className на непрозрачный фон + тень.
pattern = r'(className=")([^"]*)(")(?=[\s\S]{0,240}style=\{\{[\s\S]{0,120}top,)'
new_class = (
  'absolute rounded-2xl border border-zinc-800 bg-zinc-950 '
  'p-3 text-left shadow-xl shadow-black/30 overflow-hidden hover:border-zinc-700'
)

def repl(m):
  # Не трогаем, если это не "absolute" блок
  if "absolute" not in m.group(2):
    return m.group(0)
  return m.group(1) + new_class + m.group(3)

s2, n = re.subn(pattern, repl, s, flags=re.MULTILINE)
if n == 0:
  raise SystemExit("[ERR] Не нашёл карточку day-grid (кнопку со style={{ top ... }}). Файл отличается от ожидаемого.")

s = s2

# 2) Типографика внутри карточки: время / услуга / клиент
# Делаем имя клиента ровным и читабельным, без влияния линий/фона.
repls = [
  # time label
  ('className="text-[11px] text-zinc-300"', 'className="text-xs tabular-nums text-zinc-400"'),
  ('className="text-[11px] text-zinc-400"', 'className="text-xs tabular-nums text-zinc-400"'),

  # service title
  ('className="mt-0.5 truncate text-sm font-semibold"', 'className="mt-1 truncate text-base font-semibold leading-snug text-zinc-100"'),
  ('className="mt-1 truncate text-sm font-semibold"', 'className="mt-1 truncate text-base font-semibold leading-snug text-zinc-100"'),
  ('className="mt-1 truncate text-base font-semibold leading-tight text-zinc-100"', 'className="mt-1 truncate text-base font-semibold leading-snug text-zinc-100"'),

  # client name (ключевое)
  ('className="mt-0.5 truncate text-xs text-zinc-300"', 'className="mt-1 truncate text-sm font-medium leading-snug text-zinc-200"'),
  ('className="mt-1 truncate text-xs leading-tight text-zinc-300"', 'className="mt-1 truncate text-sm font-medium leading-snug text-zinc-200"'),
  ('className="mt-1 truncate text-xs text-zinc-300"', 'className="mt-1 truncate text-sm font-medium leading-snug text-zinc-200"'),
]
for old, new in repls:
  if old in s:
    s = s.replace(old, new)

p.write_text(s, encoding="utf-8")
print("[OK] Patched day-grid card: opaque bg + typography for client name.")
PY

echo "[OK] Updated $FILE"

# Важно: если фронт не монтирует исходники (без volume), то только build гарантирует применение.
docker compose -f infra/docker-compose.yml up -d --build frontend

echo "[VERIFY] host:"
grep -n "bg-zinc-950" -n "$FILE" | head -n 5 || true

echo "[VERIFY] container:"
docker compose -f infra/docker-compose.yml exec frontend sh -lc 'grep -n "bg-zinc-950" -n app/admin/calendar/page.tsx | head -n 5' || true
