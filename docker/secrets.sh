#!/bin/sh
# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# Writes the stack's credentials into `.env`, once. Run it before the first
# `docker compose up`; running it again leaves what is already there alone.
#
# `.env` is gitignored, so these never enter the repository. Compose reads it
# automatically from the directory it is invoked in.
set -eu

ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

# **Every value is minted here rather than defaulted in `compose.yaml`.** A
# `${NAME:-something}` reads as configurable and behaves as a constant, because
# nothing makes anybody set it -- which is how `ic_app:ic_app` came to be the
# password on every install that ran this unchanged.
NAMES="IC_STACK_PG_PASSWORD IC_PG_MIGRATE_PASSWORD IC_PG_SEED_PASSWORD IC_PG_APP_PASSWORD IC_REDIS_PASSWORD"

mint() {
  # base64url over 32 bytes: no `@`, `:` or `/`, so it survives being pasted
  # into a `postgres://user:password@host` URL without escaping. That is not a
  # nicety -- a `/` in a password produces a URL that parses as a different
  # host and fails with a message about DNS.
  LC_ALL=C tr -dc 'A-Za-z0-9_-' < /dev/urandom | head -c 43
}

umask 077
[ -f "$ENV_FILE" ] || : > "$ENV_FILE"

written=0
for name in $NAMES; do
  # Left alone if the operator already set it, so re-running this is safe and
  # so a value pasted in by hand is not overwritten on the next run.
  if grep -q "^${name}=" "$ENV_FILE" 2>/dev/null; then
    continue
  fi
  printf '%s=%s\n' "$name" "$(mint)" >> "$ENV_FILE"
  written=$((written + 1))
done

if [ "$written" -eq 0 ]; then
  echo "Every credential is already in .env; nothing written."
else
  echo "Wrote $written credential(s) to .env (mode 600)."
fi

# The reminder matters more than the count: these are the only copy. Losing
# them means losing the database, since the roles are created with them once.
echo "Back this file up with the data volume, or the database becomes unreadable."
