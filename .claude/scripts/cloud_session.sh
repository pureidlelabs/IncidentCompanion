#!/usr/bin/env bash
#
# The per-session half of a Claude Code cloud environment: the docker daemon,
# the workspace install and the `.venv`, none of which the environment cache
# keeps. Run by the SessionStart hook in `.claude/settings.json`; a no-op
# outside a cloud session. Prints one line, because a SessionStart hook's
# output reaches the session as context.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:?}" || exit 0

export MISE_YES=1 MISE_GLOBAL_CONFIG_FILE=/etc/mise/config.toml MISE_TRUSTED_CONFIG_PATHS=/home/user
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"
if ! command -v mise > /dev/null; then
  echo "cloud session: the environment's setup script is not .claude/scripts/cloud_setup.sh, so nothing is installed"
  exit 0
fi

LOG=/tmp/cloud-session.log
pgrep -x dockerd > /dev/null || (setsid dockerd >> /var/log/dockerd.log 2>&1 < /dev/null &)

# A Renovate bump since the cache was built installs here rather than failing.
if ! cmp -s .devcontainer/mise.toml /etc/mise/config.toml; then
  cp .devcontainer/mise.toml /etc/mise/config.toml
  mise install >> "$LOG" 2>&1 || { echo "cloud session: mise install failed, see $LOG"; exit 0; }
fi

# Only a fresh clone installs: the hook contract tests run this inside a session
# whose suites are reading `node_modules`.
if [ -d node_modules/.bin ]; then
  true &
else
  npm ci --no-audit --no-fund >> "$LOG" 2>&1 &
fi
NPM=$!
if ! [ -x .venv/bin/python ]; then
  ( "$(mise where python@3.14)/bin/python3" -m venv .venv \
    && .venv/bin/pip install -q -r requirements-dev.txt ) >> "$LOG" 2>&1 \
    || { echo "cloud session: .venv failed, see $LOG"; exit 0; }
fi
wait "$NPM" || { echo "cloud session: npm ci failed, see $LOG"; exit 0; }

echo "cloud session: node $(node -v), dependencies installed, docker $(docker info > /dev/null 2>&1 && echo up || echo starting)"
