#!/usr/bin/env bash
#
# The per-session half of a Claude Code cloud environment: the docker daemon,
# the workspace install and the `.venv`, none of which the environment cache
# keeps. Run by the SessionStart hook in `.claude/settings.json` on startup and
# resume. Acts only in a cloud session and only on the hook's own input, and
# prints at most one line, because a SessionStart hook's output reaches the
# session as context.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
[ -n "${CLAUDE_PROJECT_DIR:-}" ] && cd "$CLAUDE_PROJECT_DIR" 2> /dev/null || exit 0
# The hook-contract tests run every wired hook, from any worktree, with the
# session's environment; their input names no SessionStart.
case "$(timeout 2 cat 2> /dev/null)" in
  *SessionStart*) ;;
  *) exit 0 ;;
esac

export MISE_GLOBAL_CONFIG_FILE=/etc/mise/config.toml
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"
if ! command -v mise > /dev/null; then
  echo "cloud session: the environment's setup script is not .claude/scripts/cloud_setup.sh, so nothing is installed"
  exit 0
fi

LOG=/tmp/cloud-session.log
: > "$LOG"
say() { echo "cloud session: $1, see $LOG"; }

pgrep -x dockerd > /dev/null || (setsid dockerd >> /var/log/dockerd.log 2>&1 < /dev/null &)
mise trust --quiet "$PWD/mise.toml" >> "$LOG" 2>&1

# The cache holds the versions `main` pinned when it was built; a later bump
# installs here.
if ! cmp -s .devcontainer/mise.toml /etc/mise/config.toml; then
  cp .devcontainer/mise.toml /etc/mise/config.toml
  mise install >> "$LOG" 2>&1 || { say "mise install failed"; exit 0; }
fi
NPM_VERSION="$(sed -nE 's/^ARG NPM_VERSION=//p' .devcontainer/Dockerfile)"
if [ -n "$NPM_VERSION" ] && [ "$(npm -v 2> /dev/null)" != "$NPM_VERSION" ]; then
  npm install -g "npm@$NPM_VERSION" >> "$LOG" 2>&1 || { say "npm $NPM_VERSION failed"; exit 0; }
fi

# A resumed session keeps what its first start installed.
if [ -d node_modules/.bin ]; then
  true &
else
  npm ci --no-audit --no-fund >> "$LOG" 2>&1 &
fi
NPM=$!

VENV=0
if ! [ -x .venv/bin/python ]; then
  PY="$(mise where python@3.14 2> /dev/null)/bin/python3"
  if [ -x "$PY" ]; then
    { "$PY" -m venv .venv && .venv/bin/pip install -q -r requirements-dev.txt; } >> "$LOG" 2>&1 || VENV=1
  else
    echo "python@3.14 is not installed" >> "$LOG"
    VENV=1
  fi
fi

wait "$NPM" || { say "npm ci failed"; exit 0; }
[ "$VENV" -eq 0 ] || { say ".venv failed"; exit 0; }
(cd server && npx playwright install chromium) >> "$LOG" 2>&1 || { say "Chromium failed"; exit 0; }

echo "cloud session: node $(node -v), dependencies installed, docker $(docker info > /dev/null 2>&1 && echo up || echo starting)"
