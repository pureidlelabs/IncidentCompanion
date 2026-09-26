#!/usr/bin/env bash
#
# Prepare a Claude Code cloud session: the toolchain the dev container has,
# the dependencies, Chromium, and the stack's images.
#
# The claude.ai/code "Add cloud environment" form:
#
#   Name                   IncidentCompanion
#   Network access         Custom, "Also include default list" ticked, plus:
#                            mise.jdx.dev
#                            nodejs.org
#                            cdn.playwright.dev
#                            playwright.download.prss.microsoft.com
#   Environment variables  DISABLE_ERROR_REPORTING=1
#                          DISABLE_FEEDBACK_COMMAND=1
#                          CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1
#   Setup script           this whole file, pasted
#
# It runs as root from the repository root. The environment caches the result
# and does not re-run it when this file changes, so paste it again to rebuild.
set -euo pipefail

REPO="$(pwd)"
TOOLS="$REPO/.devcontainer/mise.toml"
[ -f "$TOOLS" ] || { echo "not the repository root: $REPO" >&2; exit 1; }

pinned() {
  local value
  value="$(sed -nE "$1" .devcontainer/Dockerfile)"
  [ -n "$value" ] || { echo "no match in .devcontainer/Dockerfile: $1" >&2; exit 1; }
  printf '%s' "$value"
}
MISE_IMAGE="$(pinned 's#^COPY --from=(jdxcode/mise:[^ ]+) .*#\1#p')"
NPM_VERSION="$(pinned 's/^ARG NPM_VERSION=//p')"

trap 'jobs -p | xargs -r kill 2>/dev/null' EXIT

setsid dockerd >> /var/log/dockerd.log 2>&1 < /dev/null &
for _ in $(seq 1 30); do docker info > /dev/null 2>&1 && break; sleep 1; done
docker info > /dev/null

# mise from the image digest the dev container copies it from.
docker pull -q "$MISE_IMAGE" > /dev/null
MISE_BOX="$(docker create "$MISE_IMAGE")"
mkdir -p "$HOME/.local/bin"
docker cp "$MISE_BOX:/usr/local/bin/mise" "$HOME/.local/bin/mise"
docker rm "$MISE_BOX" > /dev/null

export MISE_YES=1 MISE_GLOBAL_CONFIG_FILE="$TOOLS" MISE_TRUSTED_CONFIG_PATHS="$REPO"
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"

mise install
# `pyproject.toml` requires 3.14, which the cloud image does not ship.
mise install python@3.14
PY="$(mise where python@3.14)/bin/python3"

npm install -g "npm@$NPM_VERSION"

npm ci --no-audit --no-fund > /tmp/setup-npm.log 2>&1 &
NPM=$!
( "$PY" -m venv "$REPO/.venv" \
  && "$REPO/.venv/bin/pip" install -q --upgrade pip \
  && "$REPO/.venv/bin/pip" install -q -r requirements-dev.txt ) > /tmp/setup-venv.log 2>&1 &
VENV=$!
docker compose -f server/compose.dev.yaml pull -q > /tmp/setup-images.log 2>&1 &
IMAGES=$!

wait "$NPM" || { tail -20 /tmp/setup-npm.log >&2; exit 1; }
# The image's preinstalled Chromium belongs to another Playwright release.
(cd server && npx playwright install --with-deps chromium) > /tmp/setup-playwright.log 2>&1 \
  || { tail -20 /tmp/setup-playwright.log >&2; exit 1; }
wait "$VENV" || { tail -20 /tmp/setup-venv.log >&2; exit 1; }
wait "$IMAGES" || { tail -20 /tmp/setup-images.log >&2; exit 1; }

# The filesystem is cached after this script, so the daemon stops cleanly
# rather than leaving its socket and databases mid-write.
pkill -TERM -x dockerd
for _ in $(seq 1 30); do pgrep -x dockerd > /dev/null || break; sleep 1; done

# The session's shells are built from `.bashrc`, and nothing started above
# survives into the session, so the daemon starts there.
BEGIN='# >>> incidentcompanion cloud >>>'
END='# <<< incidentcompanion cloud <<<'
touch /root/.bashrc
sed -i "/^$BEGIN\$/,/^$END\$/d" /root/.bashrc
cat >> /root/.bashrc <<EOF
$BEGIN
export MISE_GLOBAL_CONFIG_FILE="$TOOLS" MISE_TRUSTED_CONFIG_PATHS="$REPO"
export PATH="\$HOME/.local/share/mise/shims:\$HOME/.local/bin:\$PATH"
pgrep -x dockerd > /dev/null || (setsid dockerd >> /var/log/dockerd.log 2>&1 < /dev/null &)
$END
EOF

echo "ready: node $(node -v), npm $(npm -v), $("$REPO/.venv/bin/python" -V), vale $(vale --version | awk '{print $NF}')"
