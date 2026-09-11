#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Instale Node.js 20 ou superior antes de continuar."
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install
fi
( sleep 1; command -v xdg-open >/dev/null && xdg-open http://localhost:3000 >/dev/null 2>&1 || true ) &
npm start
