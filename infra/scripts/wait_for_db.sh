#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-localhost}"
PORT="${2:-5432}"
DB="${3:-yclients}"
USER="${4:-postgres}"

echo "Ожидаю доступность PostgreSQL ${HOST}:${PORT}/${DB}..."
for i in {1..60}; do
  if pg_isready -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" >/dev/null 2>&1; then
    echo "PostgreSQL готов."
    exit 0
  fi
  sleep 1
done

echo "PostgreSQL не стал доступен вовремя."
exit 1

