#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

copy_if_missing () {
  local src="$1"
  local dst="$2"
  if [ ! -f "$dst" ]; then
    cp "$src" "$dst"
    echo "Создан: $dst"
  else
    echo "Уже существует: $dst"
  fi
}

copy_if_missing "$ROOT_DIR/backend/.env.example" "$ROOT_DIR/backend/.env"
copy_if_missing "$ROOT_DIR/frontend/.env.example" "$ROOT_DIR/frontend/.env"

