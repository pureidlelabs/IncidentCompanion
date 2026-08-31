#!/bin/sh
# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# Mint `AUTH_SECRET` on first run, then get out of the way. The server refuses
# to start without one and a default would be a key that ships.
#
# `exec`s, so node receives SIGTERM and Nest's shutdown hooks close the pool.
set -eu

# Set explicitly -- by an operator, or by a second app server told to match the
# first -- means this has no opinion. Instances must agree on the key or each
# rejects the others' cookies.
if [ -z "${AUTH_SECRET:-}" ]; then
  SECRET_FILE="${IC_INSTALL_DIR:-/install}/secret"

  # **`-s`, not `-f`**: an interrupted first run leaves the file created and
  # empty, and every later start would then read an empty secret.
  if [ ! -s "$SECRET_FILE" ]; then
    mkdir -p "$(dirname "$SECRET_FILE")"
    # `umask` rather than a later `chmod`, so the key never exists at the
    # default mode. base64url, so it survives an environment variable.
    (
      umask 077
      node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("base64url"))' \
        > "$SECRET_FILE"
    )
  fi

  AUTH_SECRET="$(cat "$SECRET_FILE")"
  export AUTH_SECRET
fi

exec "$@"
