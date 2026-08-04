#!/bin/sh
set -eu

data_dir="${BUROBALL_DATA_DIR:-/data}"
port="${PORT:-3000}"
public_url="${OFFICE_FOOS_PUBLIC_URL:-http://localhost:$port}"
wrangler_config="${OFFICE_FOOS_WRANGLER_CONFIG:-/app/wrangler.jsonc}"

mkdir -p "$data_dir"

CI=true npx wrangler d1 migrations apply DB \
  --local \
  --persist-to "$data_dir" \
  --config "$wrangler_config"

invite_record="$(node --input-type=module -e '
  import { createHash, randomBytes, randomUUID } from "node:crypto";
  const token = randomBytes(24).toString("base64url");
  const now = Date.now();
  const hash = createHash("sha256").update(token).digest("base64url");
  process.stdout.write([randomUUID(), token, hash, now, now + 7 * 24 * 60 * 60 * 1000].join("\t"));
')"

old_ifs="$IFS"
IFS="	"
set -- $invite_record
IFS="$old_ifs"
invite_id="$1"
invite_token="$2"
invite_hash="$3"
invite_created_at="$4"
invite_expires_at="$5"

npx wrangler d1 execute DB \
  --local \
  --persist-to "$data_dir" \
  --config "$wrangler_config" \
  --yes \
  --command "INSERT INTO invitations (id, token_hash, created_by, created_at, expires_at, used_by, used_at) VALUES ('$invite_id', '$invite_hash', 'startup', $invite_created_at, $invite_expires_at, NULL, NULL)" \
  >/dev/null

printf '\n[office-foos] Startup invitation (valid for 7 days, one-time use):\n'
printf '[office-foos] %s/?invite=%s\n\n' "${public_url%/}" "$invite_token"

set -- npx wrangler dev \
  --local \
  --persist-to "$data_dir" \
  --config "$wrangler_config" \
  --ip 0.0.0.0 \
  --port "$port" \
  --log-level info \
  --show-interactive-dev-session false

if [ "${BUROBALL_DEMO_MODE:-false}" = "true" ]; then
  set -- "$@" --var "BUROBALL_DEMO_MODE:true"
fi

exec "$@"
