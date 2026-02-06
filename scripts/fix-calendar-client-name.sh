#!/usr/bin/env bash
set -euo pipefail

FILE="frontend/app/admin/calendar/page.tsx"

if [ ! -f "$FILE" ]; then
  echo "[ERR] Не найден файл: $FILE"
  exit 1
fi

# Проверим, что это тот самый блок (полупрозрачный фон)
if ! grep -q 'bg-zinc-900/50 p-2' "$FILE"; then
  echo "[ERR] Не найден ожидаемый шаблон карточки (bg-zinc-900/50 p-2)."
  echo "[HINT] Покажи строки с bg-zinc- в day-view:"
  grep -n "bg-zinc" "$FILE" | head -n 40
  exit 1
fi

python3 - <<'PY'
from pathlib import Path

p = Path("frontend/app/admin/calendar/page.tsx")
s = p.read_text(encoding="utf-8")

repls = [
  (
    'className="absolute rounded-xl border border-zinc-800 bg-zinc-900/50 p-2 text-left hover:border-zinc-700"',
    'className="absolute rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-left shadow-lg shadow-black/20 hover:border-zinc-700"'
  ),
  (
    'className="flex items-start justify-between gap-2"',
    'className="flex items-start justify-between gap-3"'
  ),
  (
    'className="text-[11px] text-zinc-300"',
    'className="text-[11px] tabular-nums text-zinc-400"'
  ),
  (
    'className="mt-0.5 truncate text-sm font-semibold"',
    'className="mt-1 truncate text-sm font-semibold leading-tight text-zinc-100"'
  ),
  (
    'className="mt-0.5 truncate text-xs text-zinc-300"',
    'className="mt-1 truncate text-xs leading-tight text-zinc-300"'
  ),
]

changed = 0
for old, new in repls:
  if old in s:
    s = s.replace(old, new)
    changed += 1

if changed < 3:
  raise SystemExit("[ERR] Не удалось применить патч: шаблоны не совпали (возможно файл уже отличается).")

p.write_text(s, encoding="utf-8")
print("[OK] Patched day-grid booking card (opaque background + typography).")
PY

echo "[OK] Updated: $FILE"
