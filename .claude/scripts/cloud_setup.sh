#!/usr/bin/env bash
#
# Prepare a Claude Code cloud session: the toolchain the dev container has,
# the dependencies, Chromium, and the stack's images.
#
# The cloud environment's setup script is one line, run from the repository
# root as root:
#
#     bash .claude/scripts/cloud_setup.sh
#
# The environment caches the result and does not re-run it when this file
# changes, so edit the environment's setup script to rebuild.
set -euo pipefail

REPO="$(pwd)"
TOOLS="$REPO/.devcontainer/mise.toml"
[ -f "$TOOLS" ] || { echo "not the repository root: $REPO" >&2; exit 1; }

MISE_VERSION="v$(sed -nE 's#.*jdxcode/mise:([0-9.]+)@.*#\1#p' .devcontainer/Dockerfile)"
export MISE_VERSION MISE_YES=1
export MISE_GLOBAL_CONFIG_FILE="$TOOLS" MISE_TRUSTED_CONFIG_PATHS="$REPO"
curl -fsSL https://mise.run | sh
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"

mise install
# `pyproject.toml` requires 3.14, which the cloud image does not ship.
mise install python@3.14
PY="$(mise where python@3.14)/bin/python3"

npm install -g "npm@$(sed -nE 's/^ARG NPM_VERSION=//p' .devcontainer/Dockerfile)"

# No process outlives this script, so the daemon is here only to pull; the
# images stay in the cached filesystem.
(dockerd > /var/log/dockerd.log 2>&1 &)
for _ in $(seq 1 30); do docker info > /dev/null 2>&1 && break; sleep 1; done

npm ci --no-audit --no-fund > /tmp/setup-npm.log 2>&1 &
NPM=$!
( "$PY" -m venv "$REPO/.venv" \
  && "$REPO/.venv/bin/pip" install -q --upgrade pip \
  && "$REPO/.venv/bin/pip" install -q -r requirements-dev.txt ) > /tmp/setup-venv.log 2>&1 &
VENV=$!
( sed -nE 's/^ *image: *//p' server/compose.dev.yaml | sort -u | xargs -r -n1 docker pull -q ) \
  > /tmp/setup-images.log 2>&1 &
IMAGES=$!

wait "$NPM" || { tail -20 /tmp/setup-npm.log >&2; exit 1; }
# The image's preinstalled Chromium belongs to another Playwright release.
(cd server && npx playwright install --with-deps chromium) > /tmp/setup-playwright.log 2>&1 \
  || { tail -20 /tmp/setup-playwright.log >&2; exit 1; }
wait "$VENV" || { tail -20 /tmp/setup-venv.log >&2; exit 1; }
wait "$IMAGES" || { tail -20 /tmp/setup-images.log >&2; exit 1; }

# The session's shells are built from `.bashrc`, and the daemon is started
# there because nothing started above survives into the session.
MARK='# >>> incidentcompanion cloud >>>'
if ! grep -qF "$MARK" /root/.bashrc 2>/dev/null; then
  cat >> /root/.bashrc <<EOF
$MARK
export MISE_GLOBAL_CONFIG_FILE="$TOOLS" MISE_TRUSTED_CONFIG_PATHS="$REPO"
export PATH="\$HOME/.local/share/mise/shims:\$HOME/.local/bin:\$PATH"
if ! [ -S /var/run/docker.sock ] && ! pgrep -x dockerd > /dev/null; then
  (dockerd > /var/log/dockerd.log 2>&1 &)
fi
# <<< incidentcompanion cloud <<<
EOF
fi

echo "ready: node $(node -v), npm $(npm -v), $("$REPO/.venv/bin/python" -V), vale $(vale --version | awk '{print $NF}')"
