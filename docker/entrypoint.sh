#!/bin/sh
set -eu

data_dir="${BUROBALL_DATA_DIR:-/data}"
port="${PORT:-3000}"

mkdir -p "$data_dir"

npx wrangler d1 migrations apply DB \
  --local \
  --persist-to "$data_dir" \
  --config /app/wrangler.jsonc

set -- npx wrangler dev \
  --local \
  --persist-to "$data_dir" \
  --config /app/wrangler.jsonc \
  --ip 0.0.0.0 \
  --port "$port" \
  --log-level info \
  --show-interactive-dev-session false

if [ "${BUROBALL_DEMO_MODE:-false}" = "true" ]; then
  set -- "$@" --var "BUROBALL_DEMO_MODE:true"
fi

exec "$@"
