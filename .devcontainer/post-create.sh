#!/usr/bin/env bash
# Copyright (C) 2026 Boudewijn
# SPDX-License-Identifier: AGPL-3.0-only
#
# Fills `.venv` and three `node_modules` trees on first create. `onCreateCommand`
# has already cloned the workspace by the time this runs, so the checkout is
# real but has never been bootstrapped -- these directories do not exist yet.
#
# Idempotent, so it is safe to re-run by hand after adding a dependency.
set -euo pipefail

cd "$(dirname "$0")/.."
echo "==> bootstrapping in $(pwd)"

# --- Python ---------------------------------------------------------------
#
# Front-loads what `test.sh` would otherwise do on the first run, so the ~2
# minute wait lands during the container build. The interpreter comes from
# `scripts/venv_python.sh`, which `test.sh` and `post-start.sh` also ask: an
# empty volume and a macOS `.venv` are the same question, and one answer beats
# three.
echo "==> python venv"
VENV_PY="$(scripts/venv_python.sh --ensure)"
"$VENV_PY" -m pip install --quiet --upgrade pip
"$VENV_PY" -m pip install --quiet -r requirements-dev.txt

# --- Node -----------------------------------------------------------------
#
# One tree: the root is a workspace, so a single install fills `server/` and
# `ui/` from one lockfile. It used to be three, and the client build needed a
# symlink in the image to make the two of them behave as one.
#
# `npm ci` rather than `npm install`, so the lockfile decides and a container
# build cannot quietly resolve a different tree than the host has.
echo "==> npm ci"
npm ci --no-audit --no-fund

# --- Playwright -----------------------------------------------------------
#
# **Chromium is in the image** (`.devcontainer/Dockerfile`), at
# `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`, so the browser tier
# (`server/e2e`, `npm run visual`) runs with no per-session install. It costs a
# heavier image and a slower rebuild -- the price of the tier no longer skipping
# in silence for want of a `playwright install` nobody remembers to run. Only
# Chromium, because both configs run the `chromium` project and no other.
echo
echo "==> ready. The browser tier is installed -- Chromium, in the image."
echo
echo "    The usual:"
echo "     ./test.sh          the suite"
echo "     ./dev-node.sh      the Node stack"
