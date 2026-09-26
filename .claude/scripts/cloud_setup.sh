#!/usr/bin/env bash
#
# Provision a Claude Code cloud environment with the dev container's toolchain.
# The per-session half is `cloud_session.sh`, run by the SessionStart hook.
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
# The setup script runs as root outside the clone, so the pinned versions are
# read from a shallow clone of `main`. The environment caches the result and
# does not re-run it when this file changes, so paste it again to rebuild.
set -euo pipefail

SRC="$(mktemp -d)"
trap 'jobs -p | xargs -r kill 2>/dev/null; rm -rf "$SRC"' EXIT
git clone -q --depth 1 https://github.com/pureidlelabs/IncidentCompanion.git "$SRC"

pinned() {
  local value
  value="$(sed -nE "$1" "$SRC/$2")"
  [ -n "$value" ] || { echo "no match in $2: $1" >&2; exit 1; }
  printf '%s' "$value"
}
MISE_IMAGE="$(pinned 's#^COPY --from=(jdxcode/mise:[^ ]+) .*#\1#p' .devcontainer/Dockerfile)"
NPM_VERSION="$(pinned 's/^ARG NPM_VERSION=//p' .devcontainer/Dockerfile)"
PLAYWRIGHT_VERSION="$(pinned 's#^ *"@playwright/test": "([^"]+)",?$#\1#p' server/package.json)"

mkdir -p /etc/mise
cp "$SRC/.devcontainer/mise.toml" /etc/mise/config.toml

setsid dockerd >> /var/log/dockerd.log 2>&1 < /dev/null &
for _ in $(seq 1 30); do docker info > /dev/null 2>&1 && break; sleep 1; done
docker info > /dev/null

# mise from the image digest the dev container copies it from.
docker pull -q "$MISE_IMAGE" > /dev/null
MISE_BOX="$(docker create "$MISE_IMAGE")"
mkdir -p "$HOME/.local/bin"
docker cp "$MISE_BOX:/usr/local/bin/mise" "$HOME/.local/bin/mise"
docker rm "$MISE_BOX" > /dev/null

export MISE_YES=1 MISE_GLOBAL_CONFIG_FILE=/etc/mise/config.toml
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"

mise install
# `pyproject.toml` requires 3.14, which the cloud image does not ship.
mise install python@3.14
npm install -g "npm@$NPM_VERSION"

# The image's preinstalled Chromium belongs to another Playwright release.
npx -y "@playwright/test@$PLAYWRIGHT_VERSION" install --with-deps chromium > /tmp/setup-playwright.log 2>&1 \
  || { tail -20 /tmp/setup-playwright.log >&2; exit 1; }
docker compose -f "$SRC/server/compose.dev.yaml" pull -q

# The filesystem is cached after this script, so the daemon stops cleanly
# rather than leaving its socket and databases mid-write.
pkill -TERM -x dockerd
for _ in $(seq 1 30); do pgrep -x dockerd > /dev/null || break; sleep 1; done

BEGIN='# >>> incidentcompanion cloud >>>'
END='# <<< incidentcompanion cloud <<<'
touch /root/.bashrc
sed -i "/^$BEGIN\$/,/^$END\$/d" /root/.bashrc
cat >> /root/.bashrc <<EOF
$BEGIN
export MISE_GLOBAL_CONFIG_FILE=/etc/mise/config.toml MISE_TRUSTED_CONFIG_PATHS=/home/user
export PATH="\$HOME/.local/share/mise/shims:\$HOME/.local/bin:\$PATH"
$END
EOF

echo "ready: node $(node -v), npm $(npm -v), $("$(mise where python@3.14)/bin/python3" -V), vale $(vale --version | awk '{print $NF}')"
